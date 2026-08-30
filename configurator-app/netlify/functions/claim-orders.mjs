import { timingSafeEqual } from 'node:crypto';

import { connectLambda, getStore } from '@netlify/blobs';

import {
  claimDesignForCustomer,
  designIdsFromOrder,
} from '../lib/design-ownership.mjs';

// Backfill: give every past customer their Locker back.
//
// Nearly every design placed before the Locker launched (2026-08-29) is filed
// under a guest browser token, because the customer designed and checked out
// without signing in. Their order names both the design and the customer, so
// walking orders re-unites the two. See design-ownership.mjs for the ownership
// rule; the ONGOING half of this lives in shopify-order-webhook.mjs.
//
//   GET /.netlify/functions/claim-orders?dryRun=1   (report only, changes nothing)
//   GET /.netlify/functions/claim-orders?dryRun=0   (claims)
//
// Both require the `x-dspln-admin-key` header. Long histories page: pass the
// returned `nextCursor` back as `cursor` until it comes back null.

const STORE_NAME = 'dspln-customer-designs';
const ORDERS_PER_PAGE = 25;
const LINE_ITEMS_PER_ORDER = 30;
// Netlify's synchronous functions stop at 10s. Return the cursor before then so
// a long history resumes on the next call instead of dying mid-page.
const TIME_BUDGET_MS = 7_000;
// The tally is the answer; the per-design list is a sample for eyeballing.
const MAX_REPORTED_CLAIMS = 200;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body, null, 2),
});

// Fails CLOSED, unlike the read-only endpoints: this one rewrites ownership, so
// an unset key must lock it rather than open it.
function adminKeyOk(event) {
  const expected = process.env.DSPLN_ADMIN_API_KEY;
  if (!expected) return false;
  const given =
    event.headers['x-dspln-admin-key'] ?? event.headers['X-Dspln-Admin-Key'] ?? '';
  const a = Buffer.from(String(given));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const shopContext = () => ({
  token: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
  shopDomain: process.env.SHOPIFY_SHOP_DOMAIN || 'f39242.myshopify.com',
});

const ORDERS_QUERY = `query ClaimOrders($cursor: String, $orders: Int!, $lineItems: Int!) {
  orders(first: $orders, after: $cursor, sortKey: PROCESSED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes {
      name
      processedAt
      customer { legacyResourceId }
      lineItems(first: $lineItems) {
        nodes { customAttributes { key value } }
      }
    }
  }
}`;

async function fetchOrders({ token, shopDomain }, cursor) {
  const response = await fetch(
    `https://${shopDomain}/admin/api/2025-04/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        query: ORDERS_QUERY,
        variables: {
          cursor: cursor || null,
          orders: ORDERS_PER_PAGE,
          lineItems: LINE_ITEMS_PER_ORDER,
        },
      }),
    },
  );

  if (!response.ok) throw new Error(`Shopify ${response.status}: ${await response.text()}`);
  const body = await response.json();
  if (body.errors?.length) throw new Error(JSON.stringify(body.errors));
  return body.data.orders;
}

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  if (!adminKeyOk(event)) {
    return json(401, {
      error: 'A valid x-dspln-admin-key is required. Set DSPLN_ADMIN_API_KEY to enable this endpoint.',
    });
  }

  const shop = shopContext();
  if (!shop.token) {
    return json(500, { error: 'SHOPIFY_ADMIN_ACCESS_TOKEN is not configured.' });
  }

  const query = event.queryStringParameters ?? {};
  // Defaults to a dry run: claiming rewrites ownership, so the destructive
  // reading of an ambiguous request is never the default one.
  const dryRun = query.dryRun !== '0';

  connectLambda(event);
  const store = getStore(STORE_NAME);

  const startedAt = Date.now();
  const tally = {
    claimed: 0,
    alreadyOwned: 0,
    ownedByAccount: 0,
    notFound: 0,
    failed: 0,
  };
  const claims = [];
  const skippedOrders = [];
  let ordersScanned = 0;
  let designRefs = 0;
  let oldestOrderProcessedAt = null;
  let cursor = query.cursor || null;
  let hasNextPage = true;

  try {
    while (hasNextPage && Date.now() - startedAt < TIME_BUDGET_MS) {
      const page = await fetchOrders(shop, cursor);
      hasNextPage = page.pageInfo.hasNextPage;
      cursor = page.pageInfo.endCursor;

      for (const order of page.nodes) {
        ordersScanned += 1;
        oldestOrderProcessedAt = order.processedAt ?? oldestOrderProcessedAt;

        const designIds = designIdsFromOrder(order);
        if (!designIds.length) continue;
        designRefs += designIds.length;

        const customerId = order.customer?.legacyResourceId;
        if (!customerId) {
          // A refund or cancellation does NOT disown the artwork, so financial
          // status is deliberately ignored — but an order with no customer at
          // all names nobody to give the design to.
          skippedOrders.push({ order: order.name, reason: 'no customer on order', designIds });
          continue;
        }

        for (const designId of designIds) {
          try {
            const result = await claimDesignForCustomer(store, {
              designId,
              shopDomain: shop.shopDomain,
              customerId,
              dryRun,
            });
            if (result.status === 'claimed') {
              tally.claimed += 1;
              if (claims.length < MAX_REPORTED_CLAIMS) claims.push({ order: order.name, ...result });
            } else if (result.status === 'already-owned') tally.alreadyOwned += 1;
            else if (result.status === 'owned-by-account') tally.ownedByAccount += 1;
            else tally.notFound += 1;
          } catch (error) {
            tally.failed += 1;
            console.error('[claim-orders] claim failed', { order: order.name, designId, error });
          }
        }
      }
    }
  } catch (error) {
    console.error('[claim-orders] run failed', error);
    return json(502, {
      error: error instanceof Error ? error.message : String(error),
      partial: { dryRun, ordersScanned, tally, nextCursor: cursor },
    });
  }

  const payload = {
    ok: true,
    dryRun,
    shopDomain: shop.shopDomain,
    ordersScanned,
    designRefs,
    oldestOrderProcessedAt,
    tally,
    claims,
    claimsTruncated: tally.claimed > claims.length,
    skippedOrders,
    // Non-null means the history is longer than one run's time budget: call
    // again with ?cursor=<this>.
    nextCursor: hasNextPage ? cursor : null,
  };
  console.log('[claim-orders]', { dryRun, ordersScanned, ...tally });
  return json(200, payload);
};
