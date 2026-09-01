import { getStore } from '@netlify/blobs';

// A member's own settings: what we email them about, and what the Locker
// shows. DSPLN owns this record rather than Shopify because a member exists
// here before — and possibly without — a Shopify customer.
//
// Marketing state is mirrored to Shopify when SHOPIFY_ADMIN_TOKEN is present,
// because that is where campaigns are actually sent from. The mirror is
// best-effort: a member's preference is saved here either way, and a failed
// push is logged rather than shown to them as a broken toggle.

const STORE_NAME = 'dspln-locker-preferences';
const OWNER_PATTERN = /^(shopify:[a-z0-9.-]+:\d+|dspln:[A-Za-z0-9_-]+)$/;
const API_VERSION = '2026-07';
const SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN || 'f39242.myshopify.com';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });

const keyFor = (ownerKey) => `preferences/${encodeURIComponent(ownerKey)}`;

const defaults = () => ({
  // Order mail is transactional — where an order is, what it needs. It is not
  // a marketing preference and is deliberately not switchable off.
  marketingEmail: true,
  orderEmail: true,
  updatedAt: null,
});

const normalize = (input = {}, current = defaults()) => ({
  marketingEmail:
    typeof input.marketingEmail === 'boolean' ? input.marketingEmail : current.marketingEmail,
  orderEmail: true,
  updatedAt: new Date().toISOString(),
});

/** Mirror the marketing preference onto the Shopify customer, if we have one. */
async function pushToShopify(ownerKey, marketingEmail) {
  const token = process.env.SHOPIFY_ADMIN_TOKEN;
  if (!token) return { skipped: 'no-token' };
  const match = ownerKey.match(/^shopify:[^:]+:(\d+)$/);
  if (!match) return { skipped: 'no-shopify-customer' };

  const query = `mutation($input: CustomerEmailMarketingConsentUpdateInput!) {
    customerEmailMarketingConsentUpdate(input: $input) {
      userErrors { field message }
    }
  }`;
  const body = {
    query,
    variables: {
      input: {
        customerId: `gid://shopify/Customer/${match[1]}`,
        emailMarketingConsent: {
          marketingState: marketingEmail ? 'SUBSCRIBED' : 'UNSUBSCRIBED',
          // Accurate to what happened: they joined, they were told, they can
          // leave. Claiming CONFIRMED_OPT_IN would assert a double opt-in
          // that never took place.
          marketingOptInLevel: 'SINGLE_OPT_IN',
          consentUpdatedAt: new Date().toISOString(),
        },
      },
    },
  };
  const response = await fetch(`https://${SHOP_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  const errors = payload?.data?.customerEmailMarketingConsentUpdate?.userErrors ?? [];
  if (!response.ok || errors.length) {
    console.error('[locker-preferences] shopify consent push failed', response.status, errors);
    return { pushed: false };
  }
  return { pushed: true };
}

export default async (request) => {
  if (!['GET', 'PUT'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });

  if (request.method === 'GET') {
    const ownerKey = new URL(request.url).searchParams.get('ownerKey') ?? '';
    if (!OWNER_PATTERN.test(ownerKey)) return json({ error: 'Invalid customer identity' }, 400);
    const stored = await store.get(keyFor(ownerKey), { type: 'json' });
    return json({ data: { preferences: stored ?? defaults() } });
  }

  const body = await request.json().catch(() => ({}));
  const ownerKey = String(body.ownerKey ?? '');
  if (!OWNER_PATTERN.test(ownerKey)) return json({ error: 'Invalid customer identity' }, 400);

  const current = (await store.get(keyFor(ownerKey), { type: 'json' })) ?? defaults();
  const preferences = normalize(body.preferences, current);
  await store.setJSON(keyFor(ownerKey), preferences);

  let sync = { skipped: 'not-attempted' };
  try {
    sync = await pushToShopify(ownerKey, preferences.marketingEmail);
  } catch (cause) {
    console.error('[locker-preferences] shopify sync threw', cause);
    sync = { pushed: false };
  }

  return json({ data: { preferences, sync } });
};

export const config = { path: '/api/locker-preferences' };
