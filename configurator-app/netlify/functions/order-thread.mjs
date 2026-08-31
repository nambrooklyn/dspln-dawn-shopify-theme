import { timingSafeEqual } from 'node:crypto';

import { connectLambda, getStore } from '@netlify/blobs';

import {
  appendEvent, buildEvent, listEvents,
  attachmentKey, decodeAttachment,
} from '../lib/order-events.mjs';

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

const binaryResponse = (bytes, contentType, filename) => ({
  statusCode: 200,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': contentType,
    'Content-Disposition': `inline; filename="${String(filename || 'attachment').replace(/"/g, '')}"`,
    'Cache-Control': 'private, max-age=300',
  },
  body: Buffer.from(bytes).toString('base64'),
  isBase64Encoded: true,
});

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
    if (q.attachment) {
      const blob = await store.get(attachmentKey(q.ownerKey, q.orderId, q.attachment), {
        type: 'arrayBuffer',
      });
      if (!blob) return json(404, { error: 'Attachment not found' });
      const meta = await store.get(
        `${attachmentKey(q.ownerKey, q.orderId, q.attachment)}.meta`,
        { type: 'json' },
      );
      return binaryResponse(blob, meta?.contentType ?? 'application/octet-stream', meta?.filename);
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

  // A message may be text, an image, or both — a photo of a seam often says
  // more than the sentence describing it.
  let attachment = null;
  if (payload.attachment?.dataUrl) {
    const decoded = decodeAttachment(payload.attachment.dataUrl);
    if (decoded.error) return json(400, { error: decoded.error });
    const id = `att_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const key = attachmentKey(ownerKey, orderId, id);
    await store.set(key, decoded.bytes);
    const meta = {
      id,
      filename: String(payload.attachment.filename ?? 'image').slice(0, 200),
      contentType: decoded.contentType,
      bytes: decoded.bytes.length,
    };
    await store.setJSON(`${key}.meta`, meta);
    attachment = meta;
  }

  if (!payload.body?.trim() && !attachment) {
    return json(400, { error: 'A message or an image is required' });
  }

  // Without the admin key a caller is a customer: chat only, always visible,
  // always attributed to the customer. They cannot write notes, cannot post as
  // staff, and cannot mark anything internal.
  if (!isAdmin) {
    if (type !== 'chat') return json(403, { error: 'Admin key required for this event type' });
    const built = buildEvent({
      orderId, ownerKey, type: 'chat', visibility: 'customer',
      actorKind: 'customer', actorName: payload.actorName ?? null,
      title: 'Message from the customer', body: payload.body ?? null,
      payload: attachment ? { attachments: [attachment] } : null,
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
    body: payload.body ?? null,
    payload: attachment
      ? { ...(payload.payload ?? {}), attachments: [attachment] }
      : payload.payload ?? null,
  });
  await appendEvent(store, built);
  return json(200, { data: { event: built } });
};
