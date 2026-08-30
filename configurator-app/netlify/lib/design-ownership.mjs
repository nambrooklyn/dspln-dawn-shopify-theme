// Order-based design ownership.
//
// A guest design is filed under `guest:{browser token}` and has no link to a
// customer account. An ORDER closes that gap: the line item carries the design
// id, so the order is a signed statement that this customer owns this design.
// That is proof the browser token cannot give us — it is retroactive and it
// crosses devices.
//
// Used by shopify-order-webhook.mjs (claims at the moment an order is placed)
// and claim-orders.mjs (backfills the historical orders). The blob-key helpers
// mirror customer-designs.mjs exactly; keep the two in step if either moves.

const cleanPathPart = (value) =>
  encodeURIComponent(String(value || 'unknown')).replace(/%/g, '~');

export const lookupKey = (id) => `lookup/${id}.json`;
export const studioIndexKey = (id) => `studio-index/${id}.json`;

export const designKey = ({ ownerKey, productHandle, id }) =>
  `designs/${cleanPathPart(ownerKey)}/${cleanPathPart(productHandle || 'customgi')}/${id}.json`;

export const ownerKeyForCustomer = (shopDomain, customerId) =>
  `shopify:${shopDomain}:${customerId}`;

export const isGuestOwnerKey = (ownerKey) =>
  String(ownerKey ?? '').startsWith('guest:');

/**
 * Design ids referenced by one line item's attributes.
 *
 * Accepts both shapes Shopify uses: REST/webhook `properties` ({name, value})
 * and GraphQL `customAttributes` ({key, value}).
 *
 * Hidden `_`-prefixed properties are stripped before /cart/add, so the visible
 * "_3D Design" / "_Tech Pack" URLs are the reliable source — parse the
 * `design=` / `id=` parameter out rather than assuming an id format.
 */
export function designIdsFromAttributes(entries) {
  const ids = new Set();
  for (const entry of entries ?? []) {
    const name = entry?.name ?? entry?.key;
    const value = entry?.value != null ? String(entry.value) : '';
    if (!value) continue;

    if (name === '_dspln_design_id' || name === '_configurator_id') {
      ids.add(value);
      continue;
    }

    const match = value.match(/[?&](?:id|design)=([^&\s#]+)/);
    if (match) {
      try {
        ids.add(decodeURIComponent(match[1]));
      } catch {
        ids.add(match[1]);
      }
    }
  }
  return [...ids];
}

/** Design ids on a whole order, from either the REST/webhook or GraphQL shape. */
export function designIdsFromOrder(order) {
  const ids = new Set();
  const lineItems = order?.line_items ?? order?.lineItems?.nodes ?? [];
  for (const item of lineItems) {
    const attributes = item?.properties ?? item?.customAttributes ?? [];
    designIdsFromAttributes(attributes).forEach((id) => ids.add(id));
  }
  return [...ids];
}

/**
 * Re-keys one record and repoints its lookup entry. The id never changes, so
 * share links and `lookup/{id}.json` stay valid. Writing the new blob before
 * deleting the old one means a mid-flight failure leaves the record readable
 * under the guest key (the next run retries it) rather than losing it.
 *
 * Same contract as moveClaimedRecord in customer-designs.mjs.
 */
export async function moveRecord(store, oldKey, newKey, record) {
  await store.setJSON(newKey, record);
  await store.setJSON(lookupKey(record.id), { key: newKey });
  if (record.configData?.studio === true) {
    await store.setJSON(studioIndexKey(record.id), { key: newKey });
  }
  if (oldKey !== newKey) await store.delete(oldKey);
}

/**
 * Claim one design for the customer who ordered it.
 *
 * Only ever moves a `guest:` record. A design already owned by a `shopify:`
 * key is left untouched — without that guard one order could drag another
 * customer's design into the buyer's Locker. That also makes the job
 * idempotent: a second run over the same orders claims nothing.
 *
 * Returns a status rather than throwing, so a backfill can report per design.
 */
export async function claimDesignForCustomer(store, { designId, shopDomain, customerId, customerEmail = null, dryRun = false }) {
  if (!designId || !shopDomain || !customerId) {
    return { designId, status: 'skipped', reason: 'missing id, shop or customer' };
  }

  const lookup = await store.get(lookupKey(designId), { type: 'json' });
  if (!lookup?.key) return { designId, status: 'not-found', reason: 'no lookup entry' };

  const record = await store.get(lookup.key, { type: 'json' });
  if (!record?.id) return { designId, status: 'not-found', reason: 'no record' };

  const from = record.ownerKey ?? null;
  const ownerKey = ownerKeyForCustomer(shopDomain, customerId);

  if (ownerKey === from) return { designId, status: 'already-owned', from, to: ownerKey };
  if (!isGuestOwnerKey(from)) {
    return { designId, status: 'owned-by-account', from, to: ownerKey };
  }

  const claimed = {
    ...record,
    ownerKey,
    shopifyCustomerId: String(customerId),
    // The email makes the record resolvable by DSPLN's own admin without
    // asking Shopify who the customer is. Never overwrite one already there.
    customerEmail: record.customerEmail || customerEmail || null,
    guestToken: null,
    updatedAt: record.updatedAt ?? new Date().toISOString(),
  };
  const newKey = designKey(claimed);

  if (!dryRun) await moveRecord(store, lookup.key, newKey, claimed);

  return {
    designId,
    status: 'claimed',
    from,
    to: ownerKey,
    name: record.name ?? null,
    productHandle: record.productHandle ?? null,
  };
}
