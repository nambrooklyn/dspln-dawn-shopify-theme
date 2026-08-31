import assert from 'node:assert/strict';
import { lockerOrderFromWebhook, archiveOrder, orderArchiveKey } from './order-archive.mjs';

const webhookOrder = {
  id: 7747777364264, name: '#1250', processed_at: '2026-08-30T02:29:40Z',
  financial_status: 'paid', fulfillment_status: null,
  current_total_price: '71.75', currency: 'USD',
  order_status_url: 'https://dspln.com/.../orders/abc123/authenticate?key=x',
  customer: { id: 10882399895848, email: 'jgzakriski200@yahoo.com' },
  billing_address: { first_name: 'Joseph', last_name: 'Zakriski', address1: '9 Deer Run Dr', address2: 'D', city: 'Hudson Falls', province_code: 'NY', zip: '12839', country: 'United States' },
  shipping_address: { name: 'Joseph Zakriski', address1: '9 Deer Run Dr', city: 'Hudson Falls', province_code: 'NY', zip: '12839', country: 'United States' },
  fulfillments: [],
  line_items: [{
    title: 'Short Sleeve Rashguard', quantity: 1, price: '65.00',
    properties: [
      { name: '_Rashguard Size', value: 'L' },
      { name: '_preview_image_url', value: 'https://x/.netlify/functions/preview-image?key=abc.jpg' },
      { name: 'empty', value: '' },
    ],
  }],
};

const mapped = lockerOrderFromWebhook(webhookOrder);
assert.equal(mapped.id, '7747777364264');
assert.equal(mapped.fulfillmentStatus, 'unfulfilled', 'null fulfillment -> unfulfilled, still Ordered stage');
assert.equal(mapped.totalAmount, '71.75');
assert.equal(mapped.items[0].imageUrl, 'https://x/.netlify/functions/preview-image?key=abc.jpg', 'preview render wins');
assert.equal(mapped.items[0].totalAmount, '65.00');
assert.equal(mapped.items[0].properties.length, 2, 'empty property dropped');
assert.equal(mapped.billingAddress.name, 'Joseph Zakriski', 'first+last name join');
assert.equal(mapped.billingAddress.province, 'NY');
console.log('mapping ok');

const blobs = new Map();
const store = { setJSON: async (k, v) => blobs.set(k, v) };
const r = await archiveOrder(store, webhookOrder, 'f39242.myshopify.com');
assert.equal(r.archived, true);
assert.ok(blobs.has(orderArchiveKey('shopify:f39242.myshopify.com:10882399895848', '7747777364264')));
const skip = await archiveOrder(store, { id: 1, customer: null }, 'f39242.myshopify.com');
assert.equal(skip.archived, false, 'customerless order skipped, not thrown');
console.log('archive ok\nall order-archive tests passed');
