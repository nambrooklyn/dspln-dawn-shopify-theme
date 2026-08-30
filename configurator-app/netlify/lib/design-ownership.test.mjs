import assert from 'node:assert/strict';
import {
  claimDesignForCustomer, designIdsFromOrder, designKey, isGuestOwnerKey, ownerKeyForCustomer,
} from './design-ownership.mjs';

function fakeStore(seed = {}) {
  const blobs = new Map(Object.entries(seed));
  return {
    blobs,
    async get(key) { return blobs.has(key) ? JSON.parse(JSON.stringify(blobs.get(key))) : null; },
    async setJSON(key, value) { blobs.set(key, JSON.parse(JSON.stringify(value))); },
    async delete(key) { blobs.delete(key); },
  };
}

const SHOP = 'f39242.myshopify.com';
const DESIGN_ID = 'short_sleeve_rashguard_order_mtf6q1ax_df06c5321cef';
const GUEST = 'guest:dd81575e-2ecb-44d7-bb32-668ba22c7ebd';

// Real order #1250, exactly as Shopify's GraphQL returned it.
const gqlOrder = {
  name: '#1250',
  customer: { legacyResourceId: '10882399895848' },
  lineItems: { nodes: [{ customAttributes: [
    { key: '_Rashguard Size', value: 'L' },
    { key: '_Artwork Layers', value: 'YES' },
    { key: '_3D Design', value: `https://dspln.com/products/custom-rashguard?design=${DESIGN_ID}&view=short-sleeve-rashguard-configurator-product-page` },
    { key: '_Tech Pack', value: `https://dspln-dawn-shopify-theme.netlify.app/tech-pack/rashguard?id=${DESIGN_ID}` },
    { key: '_preview_image_url', value: 'https://x/.netlify/functions/preview-image?key=gi%2F2026-08-30%2F972fd0d8.jpg' },
    { key: 'Custom Design Saved', value: 'Production details are securely attached to your order.' },
  ] }] },
};
// The same order as the webhook receives it (REST shape, properties/name).
const restOrder = {
  name: '#1250', order_number: 1250, id: 7747777364264,
  customer: { id: 10882399895848 },
  line_items: [{ properties: [
    { name: '_3D Design', value: `https://dspln.com/products/custom-rashguard?design=${DESIGN_ID}&view=x` },
    { name: '_Tech Pack', value: `https://x/tech-pack/rashguard?id=${DESIGN_ID}` },
  ] }],
};

// 1. Both Shopify shapes yield exactly the one design id, not the preview key.
assert.deepEqual(designIdsFromOrder(gqlOrder), [DESIGN_ID], 'graphql shape');
assert.deepEqual(designIdsFromOrder(restOrder), [DESIGN_ID], 'rest/webhook shape');
console.log('1 ok  design id extracted from both order shapes');

const seedGuest = () => ({
  [`lookup/${DESIGN_ID}.json`]: { key: `designs/${GUEST.replace(/:/g, '~3A')}/custom-rashguard/${DESIGN_ID}.json` },
  [`designs/${GUEST.replace(/:/g, '~3A')}/custom-rashguard/${DESIGN_ID}.json`]: {
    id: DESIGN_ID, name: 'Competition Rashguard', ownerKey: GUEST,
    productHandle: 'custom-rashguard', shopifyCustomerId: null,
    guestToken: 'dd81575e-2ecb-44d7-bb32-668ba22c7ebd',
    configData: { images: { chest: 'logo.png' } }, updatedAt: '2026-08-30T02:00:00.000Z',
  },
});

// 2. Dry run reports the claim and writes nothing.
{
  const store = fakeStore(seedGuest());
  const before = JSON.stringify([...store.blobs]);
  const r = await claimDesignForCustomer(store, { designId: DESIGN_ID, shopDomain: SHOP, customerId: '10882399895848', dryRun: true });
  assert.equal(r.status, 'claimed');
  assert.equal(JSON.stringify([...store.blobs]), before, 'dry run must not write');
  console.log('2 ok  dry run reports "claimed" and mutates nothing');
}

// 3. Real claim: record moves, lookup repoints, old key gone, id unchanged.
{
  const store = fakeStore(seedGuest());
  const oldKey = `designs/${GUEST.replace(/:/g, '~3A')}/custom-rashguard/${DESIGN_ID}.json`;
  const r = await claimDesignForCustomer(store, { designId: DESIGN_ID, shopDomain: SHOP, customerId: '10882399895848', dryRun: false });
  const owner = ownerKeyForCustomer(SHOP, '10882399895848');
  const newKey = designKey({ ownerKey: owner, productHandle: 'custom-rashguard', id: DESIGN_ID });

  assert.equal(r.status, 'claimed');
  assert.equal(r.from, GUEST);
  assert.equal(r.to, owner);
  assert.equal(store.blobs.has(oldKey), false, 'old blob deleted');
  const moved = store.blobs.get(newKey);
  assert.ok(moved, `record present at ${newKey}`);
  assert.equal(moved.id, DESIGN_ID, 'design id preserved so share links survive');
  assert.equal(moved.ownerKey, owner);
  assert.equal(moved.shopifyCustomerId, '10882399895848');
  assert.equal(moved.guestToken, null);
  assert.deepEqual(moved.configData.images, { chest: 'logo.png' }, 'embedded logos travel with the design');
  assert.equal(store.blobs.get(`lookup/${DESIGN_ID}.json`).key, newKey, 'lookup repointed');
  console.log('3 ok  claim moves the record, keeps the id, repoints the lookup');

  // 4. Idempotent: a second pass over the same order claims nothing.
  const again = await claimDesignForCustomer(store, { designId: DESIGN_ID, shopDomain: SHOP, customerId: '10882399895848', dryRun: false });
  assert.equal(again.status, 'already-owned');
  console.log('4 ok  re-running the backfill is a no-op');

  // 5. A DIFFERENT customer's order can never steal it.
  const thief = await claimDesignForCustomer(store, { designId: DESIGN_ID, shopDomain: SHOP, customerId: '999999', dryRun: false });
  assert.equal(thief.status, 'owned-by-account');
  assert.equal(store.blobs.get(`lookup/${DESIGN_ID}.json`).key, newKey, 'still the first owner');
  console.log('5 ok  an account-owned design is never re-keyed by another order');
}

// 6. Studio saves keep their studio-index entry pointing at the new location.
{
  const seed = seedGuest();
  const k = `designs/${GUEST.replace(/:/g, '~3A')}/custom-rashguard/${DESIGN_ID}.json`;
  seed[k].configData.studio = true;
  const store = fakeStore(seed);
  await claimDesignForCustomer(store, { designId: DESIGN_ID, shopDomain: SHOP, customerId: '10882399895848', dryRun: false });
  const newKey = designKey({ ownerKey: ownerKeyForCustomer(SHOP, '10882399895848'), productHandle: 'custom-rashguard', id: DESIGN_ID });
  assert.equal(store.blobs.get(`studio-index/${DESIGN_ID}.json`).key, newKey);
  console.log('6 ok  studio index follows the move');
}

// 7. Missing design / missing customer degrade quietly.
{
  const store = fakeStore(seedGuest());
  assert.equal((await claimDesignForCustomer(store, { designId: 'nope', shopDomain: SHOP, customerId: '1' })).status, 'not-found');
  assert.equal((await claimDesignForCustomer(store, { designId: DESIGN_ID, shopDomain: SHOP, customerId: null })).status, 'skipped');
  console.log('7 ok  unknown design and customerless order are reported, not thrown');
}

// 8. Real historical line items: every legacy attribute shape on the live
//    store, to prove the id regex neither misses nor invents an id.
{
  const attrs = (pairs) => pairs.map(([key, value]) => ({ key, value }));

  // #1215 — hidden id props survived alongside the URLs. One id, not three.
  assert.deepEqual(designIdsFromOrder({ lineItems: { nodes: [{ customAttributes: attrs([
    ['_dspln_design_id', 'gi_order_mqvs8510'],
    ['_configurator_id', 'gi_order_mqvs8510'],
    ['_config_json_storage_key', 'dspln:config:gi_order_mqvs8510'],
    ['_preview_image_url', 'https://x/.netlify/functions/preview-image?key=gi%2F2026-06-27%2Fc22f0873.jpg'],
    ['_dspln_design_url', 'https://dspln.com/products/customgi?design=gi_order_mqvs8510'],
    ['_dspln_production_url', 'https://x/api/customer-designs?id=gi_order_mqvs8510'],
  ]) }] } }), ['gi_order_mqvs8510'], '#1215 hidden props + urls collapse to one id');

  // #1212 — pre-underscore names, plus per-slot artwork URLs carrying &asset=.
  assert.deepEqual(designIdsFromOrder({ lineItems: { nodes: [{ customAttributes: attrs([
    ['3D Design Link', 'https://dspln.com/products/x?design=kids_gi_saved_mq6kqias'],
    ['Production Design Data', 'https://x/api/customer-designs?id=kids_gi_saved_mq6kqias'],
    ['Left Chest Artwork', 'https://x/api/customer-designs?id=kids_gi_saved_mq6kqias&asset=kimono%3Aleft-chest'],
    ['Back Artwork', 'https://x/api/customer-designs?id=kids_gi_saved_mq6kqias&asset=kimono%3Aback'],
  ]) }] } }), ['kids_gi_saved_mq6kqias'], '#1212 asset= suffix must not leak into the id');

  // #1210 — the pre-configurator TDA orders. No design exists; invent nothing.
  assert.deepEqual(designIdsFromOrder({ lineItems: { nodes: [{ customAttributes: attrs([
    ['Logo on Left Chest / Image URL', 'https://cdn.shopify.com/s/files/1/x/f39242-file-upload-1779059753312.png?v=1779059755'],
    ['_3D Customizer URL', 'https://dspln.com/products/customgi?variant=47964569698600&tdaState=eyI1cXFveG4iOiJ1b3lsZCJ9&tdaId=98285760'],
  ]) }] } }), [], '#1210 legacy tdaId/?v= must not look like a design id');

  console.log('8 ok  legacy order shapes: one id where there is one, none where there is none');
}

assert.equal(isGuestOwnerKey('shopify:x:1'), false);
assert.equal(isGuestOwnerKey(GUEST), true);
console.log('\nall claim-ownership tests passed');
