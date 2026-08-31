// One append-only thread per order.
//
// Everything that ever happens to an order lands here: stage changes, factory
// and PO events, every notification email sent, internal notes, and the
// conversation with the customer. Admin and customer read the SAME thread —
// `visibility` decides who sees each entry — because two renderings of one
// conversation drift the moment either changes.
//
// Nothing is ever edited or deleted, so the thread doubles as an audit trail.
// System events carry DETERMINISTIC ids so a redelivered webhook overwrites
// its own entry instead of appending a duplicate; human events get unique ids.
//
// Lives in blobs beside the order mirror for now. When the platform's Postgres
// arrives this table moves wholesale — the shape below is already the row.

const cleanPathPart = (value) =>
  encodeURIComponent(String(value || 'unknown')).replace(/%/g, '~');

export const EVENT_TYPES = [
  'stage',      // Ordered / In production / Shipped / Delivered
  'email',      // a notification we sent — logged on send, not on compose
  'production', // PO issued, accepted, cut, QC, shipped by the factory
  'chat',       // customer <-> DSPLN
  'note',       // staff-only
  'order-edit', // size swap, refund, cancellation
  'file',       // production photo, revised artwork
];

export const VISIBILITY = ['customer', 'internal'];

/** Attachment bytes live beside the thread, keyed by owner + order + id. */
export const attachmentKey = (ownerKey, orderId, attachmentId) =>
  `order-attachments/${cleanPathPart(ownerKey)}/${cleanPathPart(orderId)}/${cleanPathPart(attachmentId)}`;

// Only formats a browser will render inline, and only what a phone photo or a
// screenshot actually produces. No SVG: it can carry script.
export const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

/** Decodes a data URL into bytes, refusing anything outside the rules above. */
export function decodeAttachment(dataUrl) {
  const match = typeof dataUrl === 'string'
    ? dataUrl.match(/^data:([a-z0-9/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i)
    : null;
  if (!match) return { error: 'Attachment must be a base64 image data URL' };
  const contentType = match[1].toLowerCase();
  if (!ALLOWED_ATTACHMENT_TYPES.includes(contentType)) {
    return { error: `Unsupported image type: ${contentType}` };
  }
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!bytes.length) return { error: 'Attachment is empty' };
  if (bytes.length > MAX_ATTACHMENT_BYTES) {
    return { error: `Image is too large (max ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB)` };
  }
  return { contentType, bytes };
}

export const orderEventsPrefix = (ownerKey, orderId) =>
  `order-events/${cleanPathPart(ownerKey)}/${cleanPathPart(orderId)}/`;

/** Sorts lexicographically by time, so a prefix listing is already ordered. */
export const orderEventKey = (ownerKey, orderId, createdAt, id) =>
  `${orderEventsPrefix(ownerKey, orderId)}${createdAt}-${cleanPathPart(id)}.json`;

const clean = (value, max = 4000) => String(value ?? '').trim().slice(0, max);

export function buildEvent({
  orderId, ownerKey, type, visibility = 'customer',
  actorKind = 'system', actorName = null,
  title, body = null, payload = null, id = null, createdAt = null,
}) {
  if (!orderId || !ownerKey) throw new Error('orderId and ownerKey are required');
  if (!EVENT_TYPES.includes(type)) throw new Error(`unknown event type: ${type}`);
  const visible = VISIBILITY.includes(visibility) ? visibility : 'internal';
  return {
    id: clean(id, 120) || `ev_${Math.random().toString(36).slice(2, 10)}`,
    orderId: String(orderId),
    ownerKey: String(ownerKey),
    type,
    visibility: visible,
    actor: { kind: actorKind, name: actorName ? clean(actorName, 120) : null },
    title: clean(title, 300),
    body: body ? clean(body) : null,
    payload: payload ?? null,
    createdAt: createdAt ?? new Date().toISOString(),
  };
}

export async function appendEvent(store, event) {
  const key = orderEventKey(event.ownerKey, event.orderId, event.createdAt, event.id);
  await store.setJSON(key, event);
  return { key, event };
}

export async function listEvents(store, ownerKey, orderId, { includeInternal = false } = {}) {
  const prefix = orderEventsPrefix(ownerKey, orderId);
  const events = [];
  let cursor;
  do {
    const page = await store.list({ prefix, cursor });
    const batch = await Promise.all(
      page.blobs.map((blob) => store.get(blob.key, { type: 'json' })),
    );
    events.push(...batch.filter(Boolean));
    cursor = page.cursor;
  } while (cursor);

  return events
    .filter((e) => includeInternal || e.visibility === 'customer')
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

/**
 * The stage events an order's current state implies. Deterministic ids mean
 * this is safe to run on every webhook delivery: an order that is still
 * unfulfilled writes only "Ordered", and the same delivery twice writes the
 * same two blobs rather than four.
 */
export function stageEventsForOrder(order, ownerKey) {
  const events = [];
  const at = (v) => v || order.processed_at || order.created_at || new Date().toISOString();
  const add = (id, title, createdAt, payload) =>
    events.push(buildEvent({
      orderId: String(order.id), ownerKey, type: 'stage', visibility: 'customer',
      id, title, createdAt, payload,
    }));

  add('stage-ordered', `Order ${order.name ?? ''} placed`.trim(), at(order.processed_at), {
    stage: 'ordered', total: order.current_total_price ?? order.total_price ?? null,
  });

  if (order.cancelled_at) {
    add('stage-cancelled', 'Order cancelled', order.cancelled_at, {
      stage: 'cancelled', reason: order.cancel_reason ?? null,
    });
    return events;
  }

  for (const f of order.fulfillments ?? []) {
    if (!f?.tracking_number && !f?.created_at) continue;
    add(`stage-shipped-${f.tracking_number || f.created_at}`, 'Shipped', f.created_at, {
      stage: 'shipped',
      trackingCompany: f.tracking_company ?? null,
      trackingNumber: f.tracking_number ?? null,
      trackingUrl: f.tracking_url ?? null,
    });
  }
  return events;
}
