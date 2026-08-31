import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';
import pg from 'pg';

// DSPLN's own identity service.
//
// Runs as a Netlify function rather than on the portal's Cloudflare Worker:
// Better Auth needs a real Postgres connection, Workers do not do TCP to
// Postgres natively, and the portal reaches Supabase over REST for exactly
// that reason. It also puts auth on the SAME ORIGIN as the Locker, so the
// session cookie is first-party when the Locker is opened directly.
//
// Tables live in the `platform` schema (see b2b-platform's
// platform/migrations/0001_platform_identity.sql), which the pooled connection
// selects via search_path — that keeps identity out of `public`, where the
// factory portal's live tables sit.

let cached = null;

export function getAuth() {
  if (cached) return cached;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not configured');
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not configured');

  const pool = new pg.Pool({
    connectionString,
    // Supabase's pooler terminates TLS itself; the chain is not ours to verify.
    ssl: { rejectUnauthorized: false },
    // Nano compute allows 15 pooled connections in total — a function that
    // grabs a fistful of them starves the factory portal sharing this database.
    max: 3,
    idleTimeoutMillis: 10_000,
    options: '-c search_path=platform',
  });

  // Columns are snake_case (Postgres convention, and what the B2B repo's
  // Drizzle schema maps to), so every camelCase field is mapped explicitly.
  const timestamps = { createdAt: 'created_at', updatedAt: 'updated_at' };

  cached = betterAuth({
    secret,
    baseURL: process.env.AUTH_BASE_URL || 'https://dspln-dawn-shopify-theme.netlify.app',
    basePath: '/api/auth',
    trustedOrigins: [
      'https://dspln.com',
      'https://www.dspln.com',
      'https://dspln-dawn-shopify-theme.netlify.app',
      'https://dev--dspln-dawn-shopify-theme.netlify.app',
      'https://dspln-dev-2.myshopify.com',
    ],
    database: pool,
    emailAndPassword: {
      enabled: true,
      // Verification needs an email provider, which DSPLN does not have yet.
      // Requiring it before one exists would lock out every new signup.
      requireEmailVerification: false,
      minPasswordLength: 8,
    },
    user: {
      modelName: 'user',
      fields: { emailVerified: 'email_verified', ...timestamps },
      additionalFields: {
        shopifyCustomerId: { type: 'string', required: false, input: false, fieldName: 'shopify_customer_id' },
        shopDomain: { type: 'string', required: false, input: false, fieldName: 'shop_domain' },
      },
    },
    session: {
      modelName: 'session',
      fields: {
        userId: 'user_id', expiresAt: 'expires_at',
        ipAddress: 'ip_address', userAgent: 'user_agent', ...timestamps,
      },
    },
    account: {
      modelName: 'account',
      fields: {
        userId: 'user_id', accountId: 'account_id', providerId: 'provider_id',
        accessToken: 'access_token', refreshToken: 'refresh_token', idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        ...timestamps,
      },
    },
    verification: {
      modelName: 'verification',
      fields: { expiresAt: 'expires_at', ...timestamps },
    },
    // Social logins need only configuration — the account table already carries
    // providerId/accessToken/idToken. Added the moment credentials exist.
    socialProviders: {
      ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
      ...(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET
        ? {
            facebook: {
              clientId: process.env.FACEBOOK_CLIENT_ID,
              clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
            },
          }
        : {}),
    },
    account_linking: { enabled: true },
    plugins: [
      // An academy is an organization; a retail customer's gym and a B2B
      // account are the same entity in different relationships.
      organization({
        schema: {
          session: { fields: { activeOrganizationId: 'active_organization_id' } },
          organization: { modelName: 'organization', fields: { ...timestamps } },
          member: {
            modelName: 'member',
            fields: { organizationId: 'organization_id', userId: 'user_id', createdAt: 'created_at' },
          },
          invitation: {
            modelName: 'invitation',
            fields: {
              organizationId: 'organization_id', inviterId: 'inviter_id',
              expiresAt: 'expires_at', createdAt: 'created_at',
            },
          },
        },
      }),
    ],
    advanced: {
      cookiePrefix: 'dspln',
      // The Locker is embedded in dspln.com from another origin, so the cookie
      // must be cross-site to survive the iframe. Browsers still block
      // third-party cookies — the durable fix is serving the Locker from a
      // dspln.com subdomain, which is why AUTH_COOKIE_DOMAIN exists.
      crossSubDomainCookies: process.env.AUTH_COOKIE_DOMAIN
        ? { enabled: true, domain: process.env.AUTH_COOKIE_DOMAIN }
        : { enabled: false },
      defaultCookieAttributes: { sameSite: 'none', secure: true },
    },
  });

  return cached;
}
