import { stripe as stripePlugin } from '@better-auth/stripe';
import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';
import pg from 'pg';
import Stripe from 'stripe';

import { configuredPlans, stripeIsConfigured } from './academy-plans.mjs';
import { mailIsConfigured, sendPasswordReset, sendVerification } from './mailer.mjs';

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
      'https://academy.dspln.com',
      'https://locker.dspln.com',
      'https://dspln.com',
      'https://www.dspln.com',
      'https://dspln-dawn-shopify-theme.netlify.app',
      'https://dev--dspln-dawn-shopify-theme.netlify.app',
      'https://dspln-dev-2.myshopify.com',
    ],
    database: pool,
    emailAndPassword: {
      enabled: true,
      // Only require verification once mail can actually be sent. Requiring it
      // first would lock out every new signup with no way to let them in.
      requireEmailVerification: false,
      minPasswordLength: 8,
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordReset({ to: user.email, url, name: user.name });
      },
    },
    emailVerification: {
      sendOnSignUp: mailIsConfigured(),
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendVerification({ to: user.email, url, name: user.name });
      },
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
      ...academyBilling(),
    ],
    advanced: {
      cookiePrefix: 'dspln',
      // The Locker is embedded in dspln.com from another origin, so the cookie
      // must be cross-site to survive the iframe. Browsers still block
      // third-party cookies — the durable fix is serving the Locker from a
      // dspln.com subdomain, which is why AUTH_COOKIE_DOMAIN exists.
      //
      // SET IT ON PRODUCTION ONLY. A cookie scoped to .dspln.com is discarded
      // outright on dev--…netlify.app, so sign-up returns 200, no session is
      // held, and the Locker simply says you are signed out. It looks like an
      // auth bug and is a cookie-domain mismatch. Unset for branch deploys,
      // where the absent value below gives host-only cookies that work.
      crossSubDomainCookies: process.env.AUTH_COOKIE_DOMAIN
        ? { enabled: true, domain: process.env.AUTH_COOKIE_DOMAIN }
        : { enabled: false },
      defaultCookieAttributes: { sameSite: 'none', secure: true },
    },
  });

  return cached;
}

/**
 * Academy billing: the Stripe plugin, only once the keys exist.
 *
 * A subscription belongs to the academy's ORGANIZATION (referenceId = the
 * organization id), which carries the Stripe customer. One customer per
 * academy: the plan bills it monthly and, in Phase 3, every production order
 * bills the same card off-session. That is why the card Checkout collects is
 * promoted to the customer's default payment method the moment the
 * subscription completes — the order charges look it up there.
 *
 * Endpoints this adds under /api/auth: /subscription/upgrade, /list, /cancel,
 * /restore, /billing-portal, /success and the Stripe webhook at
 * /stripe/webhook. Tables: platform.subscription plus stripe_customer_id on
 * user and organization (b2b-platform migrations 0001 and 0003).
 */
function academyBilling() {
  if (!stripeIsConfigured()) return [];
  const plans = configuredPlans();
  if (!plans.length) {
    console.warn('[auth] Stripe keys are set but no STRIPE_PRICE_ACADEMY_* price id is — billing disabled');
    return [];
  }
  const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);

  const timestamps = { createdAt: 'created_at', updatedAt: 'updated_at' };
  return [
    stripePlugin({
      stripeClient,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      // Retail members never need a Stripe customer; the academy gets one
      // the first time it picks a plan.
      createCustomerOnSignUp: false,
      organization: {
        enabled: true,
        getCustomerCreateParams: async (org) => ({
          name: org.name,
          metadata: { academyId: org.id, academySlug: org.slug ?? '' },
        }),
      },
      subscription: {
        enabled: true,
        plans,
        // Only an academy's owner or admin may change its plan or open the
        // portal; any member may read it (the Billing tab shows the plan).
        authorizeReference: async ({ user, referenceId, action }, ctx) => {
          const member = await ctx.context.adapter.findOne({
            model: 'member',
            where: [
              { field: 'organizationId', value: referenceId },
              { field: 'userId', value: user.id },
            ],
          });
          if (!member) return false;
          if (action === 'list-subscription') return true;
          return ['owner', 'admin'].includes(member.role);
        },
        getCheckoutSessionParams: async () => ({
          params: {
            // Always take a card, even during a trial or a $0 first invoice,
            // because the same card pays for production orders.
            payment_method_collection: 'always',
            billing_address_collection: 'auto',
            allow_promotion_codes: true,
          },
        }),
        onSubscriptionComplete: async ({ stripeSubscription }) => {
          const customerId = typeof stripeSubscription.customer === 'string'
            ? stripeSubscription.customer
            : stripeSubscription.customer?.id;
          const paymentMethod = typeof stripeSubscription.default_payment_method === 'string'
            ? stripeSubscription.default_payment_method
            : stripeSubscription.default_payment_method?.id;
          if (!customerId || !paymentMethod) return;
          try {
            await stripeClient.customers.update(customerId, {
              invoice_settings: { default_payment_method: paymentMethod },
            });
          } catch (error) {
            // The subscription itself is fine; only the off-session default
            // is missing, and the next order charge can fall back to the
            // subscription's payment method.
            console.error('[auth] could not set the academy default payment method', error);
          }
        },
      },
      schema: {
        user: { fields: { stripeCustomerId: 'stripe_customer_id' } },
        organization: { fields: { stripeCustomerId: 'stripe_customer_id' } },
        subscription: {
          modelName: 'subscription',
          fields: {
            referenceId: 'reference_id',
            stripeCustomerId: 'stripe_customer_id',
            stripeSubscriptionId: 'stripe_subscription_id',
            stripeScheduleId: 'stripe_schedule_id',
            periodStart: 'period_start',
            periodEnd: 'period_end',
            cancelAtPeriodEnd: 'cancel_at_period_end',
            cancelAt: 'cancel_at',
            canceledAt: 'canceled_at',
            endedAt: 'ended_at',
            trialStart: 'trial_start',
            trialEnd: 'trial_end',
            billingInterval: 'billing_interval',
            ...timestamps,
          },
        },
      },
    }),
  ];
}
