import { connectLambda, getStore } from '@netlify/blobs';
import pg from 'pg';

import { getAuth } from '../lib/auth.mjs';
import { emailIndexKey, writeEmailIndex } from '../lib/design-ownership.mjs';
import { findOrCreateCustomer } from '../lib/shopify-admin.mjs';

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

// Which social buttons the sign-in screen should draw. The providers are
// configured in lib/auth.mjs purely from env vars, so the UI must not guess —
// a Google button with no credentials behind it just 500s on click.
const socialProviders = () => {
  const available = [];
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) available.push('google');
  if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) available.push('facebook');
  return available;
};

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
    return json(200, { signedIn: false, socialProviders: socialProviders(), reason: 'auth-unavailable' });
  }

  if (!session?.user) return json(200, { signedIn: false, socialProviders: socialProviders() });

  const user = session.user;
  let shopifyCustomerId = user.shopifyCustomerId ?? null;

  // Blobs must be wired up before anything reads them — the stored Shopify
  // token lives in a blob too.
  try { connectLambda(event); } catch { /* already connected */ }

  /** Remember the link so neither Shopify nor the index is asked again. */
  const rememberCustomer = async (customerId) => {
    const db = getPool();
    if (db) {
      await db.query(
        `update "user" set shopify_customer_id = $1, shop_domain = $2, updated_at = now() where id = $3`,
        [customerId, SHOP_DOMAIN, user.id],
      );
    }
    if (user.email) {
      const store = getStore(STORE_NAME);
      await writeEmailIndex(store, user.email, {
        customerId,
        ownerKey: `shopify:${SHOP_DOMAIN}:${customerId}`,
      });
    }
  };

  // First sign-in: find the Shopify customer id this email already owns.
  if (!shopifyCustomerId && user.email) {
    try {
      const store = getStore(STORE_NAME);
      const indexed = await store.get(emailIndexKey(user.email), { type: 'json' });
      if (indexed?.customerId) {
        shopifyCustomerId = String(indexed.customerId);
        await rememberCustomer(shopifyCustomerId);
      }
    } catch (error) {
      // A failed match must not block sign-in — they simply start with an
      // empty Locker and can be linked later.
      console.error('[locker-session] could not link a Shopify customer', error);
    }
  }

  // Still nothing: this member has never ordered, so Shopify has never heard
  // of them. Give them a customer record — that is what makes a member
  // reachable by marketing, and it is what turns their owner key into
  // shopify:… so designs and future orders attach without an index lookup.
  //
  // Best effort by design: a member whose Shopify record cannot be made right
  // now still gets their Locker, and the next sign-in tries again.
  if (!shopifyCustomerId && user.email) {
    try {
      const [firstName, ...rest] = (user.name || '').trim().split(' ');
      const result = await findOrCreateCustomer({
        email: user.email,
        firstName: firstName || undefined,
        lastName: rest.join(' ') || undefined,
      });
      if (result?.customerId) {
        shopifyCustomerId = result.customerId;
        await rememberCustomer(shopifyCustomerId);
        console.log(
          `[locker-session] ${result.created ? 'created' : 'matched'} Shopify customer for member`,
        );
      }
    } catch (error) {
      console.error('[locker-session] could not create a Shopify customer', error);
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
