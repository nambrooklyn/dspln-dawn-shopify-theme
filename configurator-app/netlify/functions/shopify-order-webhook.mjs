import { createHmac, timingSafeEqual } from 'node:crypto';

import { connectLambda, getStore } from '@netlify/blobs';

import {
  designIdsFromOrder,
  designKey,
  isGuestOwnerKey,
  lookupKey,
  moveRecord,
  ownerKeyForCustomer,
  writeEmailIndex,
} from '../lib/design-ownership.mjs';

// Stamps the real Shopify order number onto the saved design records once an
// order is placed, so the on-demand tech pack (generated later from the admin
// order page) can show the order number in its header and filename.
//
// It also CLAIMS the design for the ordering customer. Most people design and
// check out without signing in, which files their work under a guest browser
// token that no account can ever reach. The order names both the design and
// the customer, so this is the moment the two can be joined — see
// ../lib/design-ownership.mjs. claim-orders.mjs does the same for past orders.
//
// The design id travels on each configured line item as the `_dspln_design_id`
// property (see shopify-cart-simulator.buildShopifyTestCartLine). This webhook
// matches those ids back to their blob records and writes order.name onto them.

const STORE_NAME = 'dspln-customer-designs';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const shopContext = () => ({
  token: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
  shopDomain:
    process.env.SHOPIFY_SHOP_DOMAIN || 'f39242.myshopify.com',
});

const rawBodyBuffer = (event) =>
  event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64')
    : Buffer.from(event.body ?? '', 'utf8');

// Verify Shopify's HMAC signature when a secret is configured. If no secret is
// set yet we process anyway (and warn), so the feature works the moment the
// webhook is registered — set SHOPIFY_WEBHOOK_SECRET to enforce verification.
function isVerified(event, rawBody) {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[order-webhook] SHOPIFY_WEBHOOK_SECRET not set — skipping HMAC check');
    return true;
  }
  const header =
    event.headers['x-shopify-hmac-sha256'] ??
    event.headers['X-Shopify-Hmac-Sha256'];
  if (!header) return false;
  const digest = createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    return timingSafeEqual(Buffer.from(digest), Buffer.from(header));
  } catch {
    return false;
  }
}

async function applyOrderToDesigns(order, shopDomain) {
  const store = getStore(STORE_NAME);
  const ids = designIdsFromOrder(order);
  // The webhook body carries the customer inline, so claiming needs no
  // follow-up Shopify query (and none of the protected-customer-data access
  // that reading `customer` through the API would require).
  const customerId = order.customer?.id ?? null;
  const results = [];

  for (const id of ids) {
    try {
      const lookup = await store.get(lookupKey(id), { type: 'json' });
      if (!lookup?.key) {
        results.push({ id, updated: false, reason: 'no lookup' });
        continue;
      }
      const record = await store.get(lookup.key, { type: 'json' });
      if (!record) {
        results.push({ id, updated: false, reason: 'no record' });
        continue;
      }

      const next = {
        ...record,
        orderName: order.name ?? null,
        orderNumber: order.order_number ?? null,
        shopifyOrderId: order.id ?? null,
        updatedAt: new Date().toISOString(),
      };

      // Only a guest record is ever moved. A design already owned by an
      // account stays put, so one order can never drag another customer's
      // design into the buyer's Locker.
      let claimed = null;
      if (customerId && shopDomain && isGuestOwnerKey(next.ownerKey)) {
        claimed = { from: next.ownerKey, to: ownerKeyForCustomer(shopDomain, customerId) };
        next.ownerKey = claimed.to;
        next.shopifyCustomerId = String(customerId);
        // The order's email makes the record resolvable by DSPLN's own admin
        // (customer-designs resolveCustomer=1) without any Shopify lookup.
        next.customerEmail =
          next.customerEmail || order.email || order.customer?.email || null;
        next.guestToken = null;
      }

      const targetKey = claimed ? designKey(next) : lookup.key;
      await moveRecord(store, lookup.key, targetKey, next);
      if (claimed) {
        await writeEmailIndex(store, next.customerEmail, {
          customerId: next.shopifyCustomerId,
          ownerKey: next.ownerKey,
        });
      }
      results.push({ id, updated: true, orderName: order.name, claimed });
    } catch (error) {
      console.error('[order-webhook] failed to stamp design', id, error);
      results.push({ id, updated: false, reason: 'error' });
    }
  }

  return results;
}

// One-time helper: GET ?register=1 registers this endpoint as an ORDERS_CREATE
// webhook using the Shopify Admin token already configured for this shop.
async function registerWebhook(event) {
  const { token, shopDomain } = shopContext();
  if (!token || !shopDomain) {
    return json(400, { error: 'Missing SHOPIFY_ADMIN_ACCESS_TOKEN / SHOPIFY_SHOP_DOMAIN' });
  }
  const host = event.headers.host ?? event.headers.Host;
  const callbackUrl = `https://${host}/.netlify/functions/shopify-order-webhook`;

  const response = await fetch(
    `https://${shopDomain}/admin/api/2025-04/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        query: `mutation Create($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
          webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
            webhookSubscription { id }
            userErrors { field message }
          }
        }`,
        variables: {
          topic: 'ORDERS_CREATE',
          sub: { callbackUrl, format: 'JSON' },
        },
      }),
    },
  );

  const body = await response.json();
  const result = body?.data?.webhookSubscriptionCreate;
  if (result?.userErrors?.length) {
    return json(400, { registered: false, callbackUrl, errors: result.userErrors });
  }
  return json(200, {
    registered: true,
    callbackUrl,
    id: result?.webhookSubscription?.id ?? null,
  });
}

export const handler = async (event) => {
  connectLambda(event);

  if (event.httpMethod === 'GET') {
    if (event.queryStringParameters?.register === '1') {
      try {
        return await registerWebhook(event);
      } catch (error) {
        console.error('[order-webhook] register failed', error);
        return json(500, { error: 'Registration failed' });
      }
    }
    return json(200, { ok: true, message: 'DSPLN order webhook is live.' });
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  const rawBody = rawBodyBuffer(event);
  if (!isVerified(event, rawBody)) {
    return json(401, { error: 'HMAC verification failed' });
  }

  let order;
  try {
    order = JSON.parse(rawBody.toString('utf8') || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const shopDomain =
    event.headers['x-shopify-shop-domain'] ??
    event.headers['X-Shopify-Shop-Domain'] ??
    shopContext().shopDomain;

  try {
    const results = await applyOrderToDesigns(order, shopDomain);
    console.log('[order-webhook] stamped', order.name, results);
    // Always 200 so Shopify does not retry on partial no-ops.
    return json(200, { ok: true, order: order.name ?? null, results });
  } catch (error) {
    console.error('[order-webhook] processing failed', error);
    return json(200, { ok: false });
  }
};
