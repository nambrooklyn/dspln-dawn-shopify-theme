import { getStore } from '@netlify/blobs';

// One place to answer "can we talk to Shopify's Admin API, and with what?"
//
// The token is minted by the OAuth callback and kept in blobs. SHOPIFY_ADMIN_TOKEN
// stays supported as a fallback so a hand-pasted token keeps working.

const AUTH_STORE = 'dspln-shopify-auth';
const TOKEN_KEY = 'admin-token.json';
const API_VERSION = '2026-07';

export const shopDomain = () => process.env.SHOPIFY_SHOP_DOMAIN || 'f39242.myshopify.com';

export async function adminToken() {
  if (process.env.SHOPIFY_ADMIN_TOKEN) return process.env.SHOPIFY_ADMIN_TOKEN;
  try {
    const store = getStore({ name: AUTH_STORE, consistency: 'strong' });
    const stored = await store.get(TOKEN_KEY, { type: 'json' });
    return stored?.accessToken ?? null;
  } catch (cause) {
    console.error('[shopify-admin] could not read stored token', cause);
    return null;
  }
}

/**
 * Runs a GraphQL operation. Returns { ok, data, errors } and never throws for
 * an API-level failure — callers treat Shopify as best-effort, because a
 * member's own record must save whether or not Shopify is reachable.
 */
export async function adminGraphql(query, variables = {}) {
  const token = await adminToken();
  if (!token) return { ok: false, reason: 'no-token' };
  try {
    const response = await fetch(`https://${shopDomain()}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.errors) {
      console.error('[shopify-admin] request failed', response.status, payload?.errors);
      return { ok: false, reason: 'request-failed', errors: payload?.errors };
    }
    return { ok: true, data: payload?.data };
  } catch (cause) {
    console.error('[shopify-admin] threw', cause);
    return { ok: false, reason: 'threw' };
  }
}

/**
 * The Shopify customer for a DSPLN member, creating one if none exists.
 *
 * Membership means marketing email — that is the deal the sign-up page makes,
 * and SINGLE_OPT_IN is the honest description of it. But consent is only ever
 * SET on a customer we create: someone who already exists may have
 * unsubscribed, and re-subscribing them because they made a Locker account
 * would be both rude and, in some places, illegal.
 *
 * Returns { customerId, created } or null when Shopify is unreachable —
 * callers must treat that as "try again later", never as a failure worth
 * blocking a sign-in over.
 */
export async function findOrCreateCustomer({ email, firstName, lastName }) {
  const address = String(email ?? '').trim();
  if (!address) return null;

  const found = await adminGraphql(
    `query($query: String!) {
      customers(first: 1, query: $query) { nodes { legacyResourceId email } }
    }`,
    // Quoted so an address with punctuation cannot alter the search.
    { query: `email:"${address.replace(/"/g, '\\"')}"` },
  );
  if (!found.ok) return null;

  const existing = found.data?.customers?.nodes?.[0];
  if (existing?.legacyResourceId) {
    return { customerId: String(existing.legacyResourceId), created: false };
  }

  const made = await adminGraphql(
    `mutation($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer { legacyResourceId }
        userErrors { field message }
      }
    }`,
    {
      input: {
        email: address,
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        emailMarketingConsent: {
          marketingState: 'SUBSCRIBED',
          marketingOptInLevel: 'SINGLE_OPT_IN',
        },
        tags: ['dspln-locker'],
      },
    },
  );
  const errors = made.data?.customerCreate?.userErrors ?? [];
  if (!made.ok || errors.length) {
    console.error('[shopify-admin] customerCreate failed', made.reason, errors);
    return null;
  }
  const id = made.data?.customerCreate?.customer?.legacyResourceId;
  return id ? { customerId: String(id), created: true } : null;
}
