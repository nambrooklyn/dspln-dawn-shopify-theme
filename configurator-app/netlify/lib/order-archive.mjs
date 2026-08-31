// DSPLN's own copy of an order, captured at the moment Shopify announces it.
//
// The webhook payload carries everything the Locker's order card renders —
// items with design properties, addresses, totals, tracking — so archiving it
// here makes every order self-contained on the DSPLN side: the Locker reads
// orders from this store and needs no Shopify query and no theme postMessage.
// Records are stored already in the Locker's own order shape (see LockerOrder
// in the-locker.tsx); keep the two in step.

const cleanPathPart = (value) =>
  encodeURIComponent(String(value || 'unknown')).replace(/%/g, '~');

export const orderArchiveKey = (ownerKey, orderId) =>
  `orders/${cleanPathPart(ownerKey)}/${orderId}.json`;

const money = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : String(value ?? '');
};

const address = (a) =>
  a
    ? {
        name: a.name ?? ([a.first_name, a.last_name].filter(Boolean).join(' ') || undefined),
        address1: a.address1 ?? undefined,
        address2: a.address2 ?? undefined,
        city: a.city ?? undefined,
        province: a.province_code ?? a.province ?? undefined,
        zip: a.zip ?? undefined,
        country: a.country ?? undefined,
      }
    : undefined;

const itemProperties = (properties) =>
  (properties ?? [])
    .filter((p) => p?.name && p?.value != null && p.value !== '')
    .map((p) => ({ name: String(p.name), value: String(p.value) }));

/** Shopify's REST/webhook order payload -> the Locker's order shape. */
export function lockerOrderFromWebhook(order) {
  return {
    id: String(order.id ?? ''),
    name: order.name ?? '',
    processedAt: order.processed_at ?? order.created_at ?? '',
    financialStatus: order.financial_status ?? '',
    fulfillmentStatus: order.fulfillment_status ?? 'unfulfilled',
    totalAmount: money(order.current_total_price ?? order.total_price),
    totalCurrency: order.currency ?? '',
    statusPageUrl: order.order_status_url ?? '',
    cancelledAt: order.cancelled_at ?? undefined,
    cancelReason: order.cancel_reason ?? undefined,
    fulfillments: (order.fulfillments ?? []).map((f) => ({
      createdAt: f.created_at ?? undefined,
      trackingCompany: f.tracking_company ?? undefined,
      trackingNumber: f.tracking_number ?? undefined,
      trackingUrl: f.tracking_url ?? f.tracking_urls?.[0] ?? undefined,
    })),
    items: (order.line_items ?? []).map((item) => {
      const properties = itemProperties(item.properties);
      return {
        title: item.title ?? item.name ?? '',
        productTitle: item.title ?? undefined,
        quantity: item.quantity ?? 1,
        totalAmount: money(Number(item.price ?? 0) * (item.quantity ?? 1)),
        // The configured garment's own render, when the line carries one.
        imageUrl:
          properties.find((p) => p.name === '_preview_image_url')?.value ?? undefined,
        properties,
      };
    }),
    billingAddress: address(order.billing_address),
    shippingAddress: address(order.shipping_address),
  };
}

/**
 * Archive one order under its customer's ownerKey. An order with no customer
 * names no Locker to file it in — skipped, not an error.
 */
export async function archiveOrder(store, order, shopDomain) {
  const customerId = order?.customer?.id;
  if (!customerId || !shopDomain) return { archived: false, reason: 'no customer on order' };
  const ownerKey = `shopify:${shopDomain}:${customerId}`;
  const record = lockerOrderFromWebhook(order);
  await store.setJSON(orderArchiveKey(ownerKey, record.id), record);
  return { archived: true, ownerKey, orderId: record.id };
}
