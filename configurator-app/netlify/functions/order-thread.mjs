import { timingSafeEqual } from 'node:crypto';

import { connectLambda, getStore } from '@netlify/blobs';

import { appendEvent, buildEvent, listEvents } from '../lib/order-events.mjs';

// Read and write one order's thread.
//
//   GET  ?ownerKey=…&orderId=…            -> the customer's view
//   GET  ?ownerKey=…&orderId=…&internal=1 -> everything (admin key required)
//   POST { ownerKey, orderId, type, body, … }
//
// Trust model matches the rest of the Locker: a customer-side caller proves
// nothing beyond holding the ownerKey (the pre-existing unverified-ownerKey
// debt), so customers may only ever ADD a chat message that is attributed to
// them. Internal notes, staff replies and anything marked internal need the
// admin key — support's half of the thread is not writable from a browser.

const STORE_NAME = 'dspln-customer-designs';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-dspln-admin-key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

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
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  connectLambda(event);
  const store = getStore(STORE_NAME);
  const isAdmin = adminKeyOk(event);

  if (event.httpMethod === 'GET') {
    const q = event.queryStringParameters ?? {};
    if (!q.ownerKey || !q.orderId) {
      return json(400, { error: 'ownerKey and orderId are required' });
    }
    const wantsInternal = q.internal === '1';
    if (wantsInternal && !isAdmin) return json(403, { error: 'Admin key required' });
    const events = await listEvents(store, q.ownerKey, q.orderId, {
      includeInternal: wantsInternal,
    });
    return json(200, { data: { events } });
  }

  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const { ownerKey, orderId, type = 'chat' } = payload;
  if (!ownerKey || !orderId) return json(400, { error: 'ownerKey and orderId are required' });
  if (!payload.body?.trim()) return json(400, { error: 'body is required' });

  // Without the admin key a caller is a customer: chat only, always visible,
  // always attributed to the customer. They cannot write notes, cannot post as
  // staff, and cannot mark anything internal.
  if (!isAdmin) {
    if (type !== 'chat') return json(403, { error: 'Admin key required for this event type' });
    const built = buildEvent({
      orderId, ownerKey, type: 'chat', visibility: 'customer',
      actorKind: 'customer', actorName: payload.actorName ?? null,
      title: 'Message from the customer', body: payload.body,
    });
    await appendEvent(store, built);
    return json(200, { data: { event: built } });
  }

  const built = buildEvent({
    orderId, ownerKey, type,
    visibility: payload.visibility ?? (type === 'note' ? 'internal' : 'customer'),
    actorKind: payload.actorKind ?? 'staff',
    actorName: payload.actorName ?? 'DSPLN',
    title: payload.title ?? (type === 'note' ? 'Internal note' : 'Message from DSPLN'),
    body: payload.body,
    payload: payload.payload ?? null,
  });
  await appendEvent(store, built);
  return json(200, { data: { event: built } });
};
