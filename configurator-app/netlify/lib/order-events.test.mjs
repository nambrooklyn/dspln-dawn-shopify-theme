import assert from 'node:assert/strict';
import { buildEvent, appendEvent, listEvents, stageEventsForOrder, orderEventsPrefix } from './order-events.mjs';

const store = (() => {
  const blobs = new Map();
  return { blobs,
    async setJSON(k, v) { blobs.set(k, JSON.parse(JSON.stringify(v))); },
    async get(k) { return blobs.has(k) ? JSON.parse(JSON.stringify(blobs.get(k))) : null; },
    async list({ prefix }) { return { blobs: [...blobs.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; } };
})();

const OWNER = 'shopify:f39242.myshopify.com:10882399895848';
const order = {
  id: 990001, name: '#1250', processed_at: '2026-08-29T18:29:40Z',
  current_total_price: '71.75', fulfillments: [],
};

// 1. A fresh order gets exactly one stage event.
let evs = stageEventsForOrder(order, OWNER);
assert.equal(evs.length, 1);
assert.equal(evs[0].id, 'stage-ordered');
for (const e of evs) await appendEvent(store, e);
assert.equal((await listEvents(store, OWNER, order.id)).length, 1);
console.log('1 ok  a new order writes one stage event');

// 2. Redelivery is idempotent — same deterministic id, same blob.
for (const e of stageEventsForOrder(order, OWNER)) await appendEvent(store, e);
assert.equal((await listEvents(store, OWNER, order.id)).length, 1, 'redelivery must not duplicate');
console.log('2 ok  a redelivered webhook does not duplicate the thread');

// 3. Shipping adds a stage event carrying its tracking.
const shipped = { ...order, fulfillments: [{ created_at: '2026-09-03T10:00:00Z', tracking_company: 'USPS', tracking_number: '94001118992231', tracking_url: 'https://x' }] };
for (const e of stageEventsForOrder(shipped, OWNER)) await appendEvent(store, e);
let all = await listEvents(store, OWNER, order.id);
assert.equal(all.length, 2);
assert.equal(all[1].payload.trackingNumber, '94001118992231');
console.log('3 ok  shipping appends a stage event with tracking');

// 4. Chronological order regardless of write order.
assert.ok(all[0].createdAt <= all[1].createdAt, 'thread must read oldest-first');
console.log('4 ok  the thread reads in time order');

// 5. Internal events are hidden from the customer view, shown to admin.
await appendEvent(store, buildEvent({ orderId: order.id, ownerKey: OWNER, type: 'note',
  visibility: 'internal', actorKind: 'staff', actorName: 'Nam', title: 'Internal note',
  body: 'Front logo 2mm off the seam — flagged to Alpha.' }));
await appendEvent(store, buildEvent({ orderId: order.id, ownerKey: OWNER, type: 'chat',
  visibility: 'customer', actorKind: 'customer', title: 'Message from the customer',
  body: 'Can I switch to a medium?' }));
const customerView = await listEvents(store, OWNER, order.id);
const adminView = await listEvents(store, OWNER, order.id, { includeInternal: true });
assert.equal(adminView.length, 4);
assert.equal(customerView.length, 3, 'the internal note must not reach the customer');
assert.ok(!customerView.some(e => e.visibility === 'internal'));
console.log('5 ok  internal notes are invisible to the customer, visible to support');

// 6. One order's thread never leaks into another's.
await appendEvent(store, buildEvent({ orderId: 990002, ownerKey: OWNER, type: 'chat',
  visibility: 'customer', title: 'Other order', body: 'different order' }));
assert.equal((await listEvents(store, OWNER, order.id)).length, 3, 'threads are per-order');
console.log('6 ok  threads are scoped per order');

// 7. A cancelled order stops at cancelled and never claims to have shipped.
const cancelled = { ...shipped, cancelled_at: '2026-09-01T09:00:00Z', cancel_reason: 'customer' };
const cev = stageEventsForOrder(cancelled, OWNER);
assert.deepEqual(cev.map(e => e.id), ['stage-ordered', 'stage-cancelled']);
console.log('7 ok  a cancelled order never reports shipped');

// 8. Unknown event types are refused rather than silently stored.
assert.throws(() => buildEvent({ orderId: 1, ownerKey: OWNER, type: 'nonsense', title: 'x' }));
console.log('8 ok  unknown event types are rejected');

console.log('\nall order-thread tests passed');
