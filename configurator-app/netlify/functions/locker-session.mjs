import { connectLambda, getStore } from '@netlify/blobs';
import pg from 'pg';

import { getAuth } from '../lib/auth.mjs';
import { emailIndexKey } from '../lib/design-ownership.mjs';

// Who is signed in with DSPLN, and which Locker is theirs?
//
// A DSPLN account is not automatically the same identity as a Shopify
// customer, but for anyone who has ordered before it should be: their designs
// and orders are already filed under shopify:{shop}:{customerId}. So on first
// sign-in we resolve that id from DSPLN's OWN email index — the one the order
// claiming built today — and remember it on the user row.
//
// That is the migration path: an existing customer signs up with the address
// they ordered with and their Locker is simply already full. No manual
// matching, no support ticket, and email is never treated as proof of
// anything beyond "this is the same person who gave us this address" — the
// designs were already linked to that customer id by their ORDERS.

const STORE_NAME = 'dspln-customer-designs';
const SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN || 'f39242.myshopify.com';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': process.env.LOCKER_ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Credentials': 'true',
  },
  body: JSON.stringify(body),
});

let pool = null;
function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) return null;
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 10_000,
    options: '-c search_path=platform',
  });
  return pool;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });

  let session = null;
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(event.headers ?? {})) if (v != null) headers.set(k, String(v));
    session = await auth.api.getSession({ headers });
  } catch (error) {
    console.error('[locker-session] auth unavailable', error);
    return json(200, { signedIn: false, reason: 'auth-unavailable' });
  }

  if (!session?.user) return json(200, { signedIn: false });

  const user = session.user;
  let shopifyCustomerId = user.shopifyCustomerId ?? null;

  // First sign-in: find the Shopify customer id this email already owns.
  if (!shopifyCustomerId && user.email) {
    try {
      connectLambda(event);
      const store = getStore(STORE_NAME);
      const indexed = await store.get(emailIndexKey(user.email), { type: 'json' });
      if (indexed?.customerId) {
        shopifyCustomerId = String(indexed.customerId);
        const db = getPool();
        if (db) {
          await db.query(
            `update "user" set shopify_customer_id = $1, shop_domain = $2, updated_at = now() where id = $3`,
            [shopifyCustomerId, SHOP_DOMAIN, user.id],
          );
        }
      }
    } catch (error) {
      // A failed match must not block sign-in — they simply start with an
      // empty Locker and can be linked later.
      console.error('[locker-session] could not link a Shopify customer', error);
    }
  }

  return json(200, {
    signedIn: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name ?? '',
      emailVerified: Boolean(user.emailVerified),
    },
    // The Locker keys everything by ownerKey. A linked member reads the very
    // same records they had as a Shopify customer; an unlinked one gets their
    // own namespace rather than being shown somebody else's Locker.
    ownerKey: shopifyCustomerId
      ? `shopify:${SHOP_DOMAIN}:${shopifyCustomerId}`
      : `dspln:${user.id}`,
    shopifyCustomerId,
    shopDomain: SHOP_DOMAIN,
    linked: Boolean(shopifyCustomerId),
  });
};
