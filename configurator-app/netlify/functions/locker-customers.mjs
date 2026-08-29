import { timingSafeEqual } from 'node:crypto';

import { getStore } from '@netlify/blobs';

const STORE_NAME = 'dspln-locker-customers';
const OWNER_PATTERN = /^shopify:[a-z0-9.-]+:\d+$/i;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
    },
  });

const clean = (value, max = 180) => String(value ?? '').trim().slice(0, max);
const env = (name) => Netlify.env.get(name) ?? '';

function adminKeyStatus(request) {
  const expected = env('DSPLN_ADMIN_API_KEY');
  if (!expected) return 'missing';
  const given = request.headers.get('x-dspln-admin-key') ?? '';
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? 'authorized' : 'denied';
}

const customerKey = (ownerKey) => `customers/${encodeURIComponent(ownerKey)}.json`;

const numericId = (gid) => String(gid ?? '').split('/').pop() ?? '';

const isProduction = (context) => context?.deploy?.context === 'production';
const shopDomain = (context) =>
  isProduction(context)
    ? clean(env('SHOPIFY_SHOP_DOMAIN'), 180)
    : clean(env('SHOPIFY_DEV_SHOP_DOMAIN') || 'dspln-dev-2.myshopify.com', 180);

async function shopifyGraphql(context, query, variables = {}) {
  const token = env('SHOPIFY_ADMIN_ACCESS_TOKEN');
  const domain = shopDomain(context);
  if (!token || !domain) return null;
  const response = await fetch(`https://${domain}/admin/api/2026-07/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) return null;
  const payload = await response.json();
  return payload.errors ? null : payload.data;
}

async function importShopifyCustomers(store, context) {
  const domain = shopDomain(context);
  if (!domain) return;
  let cursor = null;
  for (let page = 0; page < 5; page += 1) {
    const data = await shopifyGraphql(
      context,
      `query LockerCustomers($after: String) {
        customers(first: 100, after: $after, sortKey: UPDATED_AT, reverse: true) {
          nodes { id email firstName lastName updatedAt }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { after: cursor },
    );
    if (!data?.customers) return;
    await Promise.all(
      data.customers.nodes.map(async (node) => {
        const customerId = numericId(node.id);
        if (!customerId) return;
        const ownerKey = `shopify:${domain}:${customerId}`;
        const key = customerKey(ownerKey);
        const current = (await store.get(key, { type: 'json' })) ?? {};
        await store.setJSON(key, {
          ...current,
          ownerKey,
          shopDomain: domain,
          customerId,
          email: clean(node.email).toLowerCase(),
          firstName: clean(node.firstName, 100),
          lastName: clean(node.lastName, 100),
          orders: current.orders ?? [],
          createdAt: current.createdAt ?? new Date().toISOString(),
          shopifyUpdatedAt: node.updatedAt,
          updatedAt: current.updatedAt ?? node.updatedAt,
        });
      }),
    );
    if (!data.customers.pageInfo.hasNextPage) return;
    cursor = data.customers.pageInfo.endCursor;
  }
}

async function loadShopifyOrders(context, customerId) {
  const data = await shopifyGraphql(
    context,
    `query LockerCustomerOrders($id: ID!) {
      customer(id: $id) {
        orders(first: 100, sortKey: PROCESSED_AT, reverse: true) {
          nodes {
            id name processedAt displayFinancialStatus displayFulfillmentStatus
            totalPriceSet { shopMoney { amount currencyCode } }
          }
        }
      }
    }`,
    { id: `gid://shopify/Customer/${customerId}` },
  );
  return (data?.customer?.orders?.nodes ?? []).map((order) => ({
    id: numericId(order.id),
    name: order.name,
    processedAt: order.processedAt,
    financialStatus: order.displayFinancialStatus,
    fulfillmentStatus: order.displayFulfillmentStatus,
    totalAmount: order.totalPriceSet?.shopMoney?.amount ?? '',
    totalCurrency: order.totalPriceSet?.shopMoney?.currencyCode ?? '',
    statusPageUrl: '',
  }));
}

function normalizeOrders(orders) {
  if (!Array.isArray(orders)) return [];
  return orders.slice(0, 100).map((order) => ({
    id: clean(order.id, 80),
    name: clean(order.name, 80),
    processedAt: clean(order.processedAt, 80),
    financialStatus: clean(order.financialStatus, 80),
    fulfillmentStatus: clean(order.fulfillmentStatus, 80),
    totalAmount: clean(order.totalAmount, 40),
    totalCurrency: clean(order.totalCurrency, 12),
    statusPageUrl: clean(order.statusPageUrl, 500),
  }));
}

export default async (request, context) => {
  const store = getStore({
    name: isProduction(context) ? STORE_NAME : `${STORE_NAME}-dev`,
    consistency: 'strong',
  });

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const ownerKey = clean(body.ownerKey, 240);
    if (!OWNER_PATTERN.test(ownerKey)) return json({ error: 'Invalid customer identity' }, 400);

    const current = (await store.get(customerKey(ownerKey), { type: 'json' })) ?? {};
    const now = new Date().toISOString();
    const customer = {
      ...current,
      ownerKey,
      shopDomain: clean(body.shopDomain, 180),
      customerId: clean(body.customerId, 80),
      email: clean(body.email).toLowerCase(),
      firstName: clean(body.firstName, 100),
      lastName: clean(body.lastName, 100),
      orders: body.orders === undefined ? current.orders ?? [] : normalizeOrders(body.orders),
      createdAt: current.createdAt ?? now,
      lastLockerVisitAt: now,
      updatedAt: now,
    };
    await store.setJSON(customerKey(ownerKey), customer);
    return json({ data: { customer } });
  }

  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const adminStatus = adminKeyStatus(request);
  if (adminStatus === 'missing') return json({ error: 'Admin access is not configured' }, 503);
  if (adminStatus !== 'authorized') return json({ error: 'Admin access denied' }, 403);

  const ownerKey = new URL(request.url).searchParams.get('ownerKey');
  if (ownerKey) {
    if (!OWNER_PATTERN.test(ownerKey)) return json({ error: 'Invalid customer identity' }, 400);
    const customer = await store.get(customerKey(ownerKey), { type: 'json' });
    if (customer) customer.orders = await loadShopifyOrders(context, customer.customerId);
    return customer ? json({ data: { customer } }) : json({ error: 'Customer not found' }, 404);
  }

  await importShopifyCustomers(store, context);
  const listing = await store.list({ prefix: 'customers/' });
  const customers = (
    await Promise.all(listing.blobs.map((blob) => store.get(blob.key, { type: 'json' })))
  )
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return json({ data: { customers } });
};

export const config = { path: '/api/locker-customers' };
