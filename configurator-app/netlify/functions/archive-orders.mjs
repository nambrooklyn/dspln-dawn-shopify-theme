import { timingSafeEqual } from 'node:crypto';

import { connectLambda, getStore } from '@netlify/blobs';

import { archiveOrder } from '../lib/order-archive.mjs';

// Reconciliation backstop for the order mirror.
//
// Webhooks get missed — failed deliveries, deploys, downtime — and a missed
// delivery leaves an order permanently wrong with nothing to detect it. This
// endpoint re-archives orders from a pushed batch, so a sweep can repair the
// mirror without waiting for Shopify to resend anything.
//
// It takes orders as DATA rather than querying Shopify, because this site
// holds no Shopify credentials: whoever runs the sweep (the factory portal,
// which has them, or an operator) fetches and pushes. Same shape the webhook
// receives, so one mapping serves both paths.
//
//   POST { "orders": [ <shopify order payload>, … ], "shopDomain"?: "…" }
//   header: x-dspln-admin-key
//
// Archiving is a plain overwrite keyed by owner + order id, so replaying the
// same batch changes nothing.

const STORE_NAME = 'dspln-customer-designs';
const MAX_ORDERS = 250;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body, null, 2),
});

// Fails CLOSED: this writes customer-visible order records.
function adminKeyOk(event) {
  const expected = process.env.DSPLN_ADMIN_API_KEY;
  if (!expected) return false;
  const given =
    event.headers['x-dspln-admin-key'] ?? event.headers['X-Dspln-Admin-Key'] ?? '';
  const a = Buffer.from(String(given));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!adminKeyOk(event)) {
    return json(401, { error: 'A valid x-dspln-admin-key is required.' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const orders = Array.isArray(payload.orders) ? payload.orders : null;
  if (!orders?.length) {
    return json(400, { error: 'Body must be {"orders": [ <shopify order>, … ]}' });
  }
  if (orders.length > MAX_ORDERS) {
    return json(400, { error: `At most ${MAX_ORDERS} orders per request` });
  }

  const shopDomain =
    payload.shopDomain || process.env.SHOPIFY_SHOP_DOMAIN || 'f39242.myshopify.com';
  const dryRun = payload.dryRun === true;

  connectLambda(event);
  const store = getStore(STORE_NAME);

  const tally = { archived: 0, skipped: 0, failed: 0 };
  const results = [];

  for (const order of orders) {
    try {
      if (dryRun) {
        const ok = Boolean(order?.customer?.id);
        tally[ok ? 'archived' : 'skipped'] += 1;
        results.push({ order: order?.name ?? null, archived: ok, dryRun: true });
        continue;
      }
      const result = await archiveOrder(store, order, shopDomain);
      tally[result.archived ? 'archived' : 'skipped'] += 1;
      results.push({ order: order?.name ?? null, ...result });
    } catch (error) {
      tally.failed += 1;
      results.push({ order: order?.name ?? null, archived: false, reason: 'error' });
      console.error('[archive-orders] failed', { order: order?.name, error });
    }
  }

  console.log('[archive-orders]', { dryRun, count: orders.length, ...tally });
  return json(200, { ok: true, dryRun, shopDomain, tally, results });
};
