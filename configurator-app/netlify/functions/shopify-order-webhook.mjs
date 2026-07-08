import { createHmac, timingSafeEqual } from 'node:crypto';

import { connectLambda, getStore } from '@netlify/blobs';

// Stamps the real Shopify order number onto the saved design records once an
// order is placed, so the on-demand tech pack (generated later from the admin
// order page) can show the order number in its header and filename.
//
// The design id travels on each configured line item as the `_dspln_design_id`
// property (see shopify-cart-simulator.buildShopifyTestCartLine). This webhook
// matches those ids back to their blob records and writes order.name onto them.

const STORE_NAME = 'dspln-customer-designs';
const DESIGN_ID_PROPERTY = '_dspln_design_id';

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

function designIdsFromOrder(order) {
  const ids = new Set();
  for (const item of order.line_items ?? []) {
    for (const prop of item.properties ?? []) {
      if (prop?.name === DESIGN_ID_PROPERTY && prop.value) {
        ids.add(String(prop.value));
      }
    }
  }
  return [...ids];
}

async function stampOrderOntoDesigns(order) {
  const store = getStore(STORE_NAME);
  const ids = designIdsFromOrder(order);
  const results = [];

  for (const id of ids) {
    try {
      const lookup = await store.get(`lookup/${id}.json`, { type: 'json' });
      if (!lookup?.key) {
        results.push({ id, updated: false, reason: 'no lookup' });
        continue;
      }
      const record = await store.get(lookup.key, { type: 'json' });
      if (!record) {
        results.push({ id, updated: false, reason: 'no record' });
        continue;
      }
      record.orderName = order.name ?? null;
      record.orderNumber = order.order_number ?? null;
      record.shopifyOrderId = order.id ?? null;
      record.updatedAt = new Date().toISOString();
      await store.setJSON(lookup.key, record);
      results.push({ id, updated: true, orderName: order.name });
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

  try {
    const results = await stampOrderOntoDesigns(order);
    console.log('[order-webhook] stamped', order.name, results);
    // Always 200 so Shopify does not retry on partial no-ops.
    return json(200, { ok: true, order: order.name ?? null, results });
  } catch (error) {
    console.error('[order-webhook] processing failed', error);
    return json(200, { ok: false });
  }
};
