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
