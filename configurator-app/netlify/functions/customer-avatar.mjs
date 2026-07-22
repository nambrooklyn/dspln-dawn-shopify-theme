import { createHash } from 'node:crypto';

import { connectLambda, getStore } from '@netlify/blobs';

const API_VERSION = '2026-07';
const MAX_IMAGE_BYTES = 1_500_000;
const STORE_NAME = 'dspln-customer-avatars';
const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([a-zA-Z0-9+/=\s]+)$/;

const response = (statusCode, body, headers = {}, isBase64Encoded = false) => ({
  statusCode,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Shopify-Shop-Id',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    ...headers,
  },
  body,
  isBase64Encoded,
});

const json = (statusCode, body) =>
  response(statusCode, JSON.stringify(body), { 'Content-Type': 'application/json' });

async function authenticatedCustomer(event) {
  const token = event.headers.authorization ?? event.headers.Authorization;
  const shopId = event.headers['x-shopify-shop-id'] ?? event.headers['X-Shopify-Shop-Id'];
  if (!token || !/^\d+$/.test(shopId ?? '')) return null;

  const shopifyResponse = await fetch(
    `https://shopify.com/${shopId}/account/customer/api/${API_VERSION}/graphql`,
    {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'query LockerAvatarOwner { customer { id } }' }),
    },
  );
  if (!shopifyResponse.ok) return null;
  const payload = await shopifyResponse.json();
  return payload?.data?.customer?.id ?? null;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return response(204, '');
  if (!['GET', 'POST', 'DELETE'].includes(event.httpMethod)) {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    connectLambda(event);
    const customerId = await authenticatedCustomer(event);
    if (!customerId) return json(401, { error: 'Sign in again to manage your photo.' });

    const key = `customer/${createHash('sha256').update(customerId).digest('hex')}`;
    const store = getStore(STORE_NAME);

    if (event.httpMethod === 'DELETE') {
      await store.delete(key);
      return json(200, { ok: true });
    }

    if (event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body ?? '{}');
      const match = String(payload.imageDataUrl ?? '').match(DATA_URL_PATTERN);
      if (!match) return json(400, { error: 'Choose a JPG, PNG, or WebP image.' });
      const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
      if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) {
        return json(413, { error: 'Profile photo must be smaller than 1.5 MB.' });
      }
      const contentType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
      await store.set(
        key,
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        { metadata: { contentType, updatedAt: new Date().toISOString() } },
      );
      return json(200, { ok: true });
    }

    const entry = await store.getWithMetadata(key, { type: 'arrayBuffer' });
    if (!entry?.data) return json(404, { error: 'No profile photo' });
    const body = Buffer.from(entry.data).toString('base64');
    return response(
      200,
      body,
      {
        'Cache-Control': 'private, no-store',
        'Content-Type': entry.metadata?.contentType || 'image/jpeg',
      },
      true,
    );
  } catch (error) {
    console.error('[customer-avatar]', error);
    return json(500, { error: 'Profile photo service failed.' });
  }
};
