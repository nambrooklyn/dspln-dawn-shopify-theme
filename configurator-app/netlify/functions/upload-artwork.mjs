import { randomUUID } from 'node:crypto';

import { connectLambda, getStore } from '@netlify/blobs';

// Full-resolution logo / artwork upload.
//
// Unlike upload-preview (small, square, JPEG thumbnails) this preserves the
// original bytes so logos keep their transparency and aspect ratio. Files are
// written to the SAME blob store as previews so the existing preview-image
// function serves them back — the only differences here are a larger size
// limit and no re-encoding. Uploading logos through this endpoint keeps the
// heavy image data OUT of the design-record JSON, which is what used to make
// the add-to-cart save fail for logo-heavy designs.
const MAX_IMAGE_BYTES = 6_000_000;
const STORE_NAME = 'dspln-preview-images';
const DATA_URL_PATTERN =
  /^data:(image\/(?:jpeg|jpg|png|webp));base64,([a-zA-Z0-9+/=\s]+)$/;

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

const absoluteFunctionUrl = (event, key) => {
  const host = event.headers.host ?? event.headers.Host;
  const protocol =
    event.headers['x-forwarded-proto'] ??
    event.headers['X-Forwarded-Proto'] ??
    'https';

  if (!host) {
    return `/.netlify/functions/preview-image?key=${encodeURIComponent(key)}`;
  }

  return `${protocol}://${host}/.netlify/functions/preview-image?key=${encodeURIComponent(key)}`;
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return jsonResponse(204, {});
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  try {
    connectLambda(event);

    const payload = JSON.parse(event.body ?? '{}');
    const imageDataUrl = String(payload.imageDataUrl ?? '');
    const match = imageDataUrl.match(DATA_URL_PATTERN);

    if (!match) {
      return jsonResponse(400, { error: 'Invalid image data URL' });
    }

    const contentType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
    const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');

    if (!bytes.byteLength || bytes.byteLength > MAX_IMAGE_BYTES) {
      return jsonResponse(413, { error: 'Artwork image is too large' });
    }

    const extension =
      contentType === 'image/png'
        ? 'png'
        : contentType === 'image/webp'
          ? 'webp'
          : 'jpg';
    const key = `gi/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
    const store = getStore(STORE_NAME);
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );

    await store.set(key, arrayBuffer, {
      metadata: {
        contentType,
        createdAt: new Date().toISOString(),
      },
    });

    return jsonResponse(200, {
      key,
      url: absoluteFunctionUrl(event, key),
    });
  } catch (error) {
    console.error('[upload-artwork]', error);
    return jsonResponse(500, { error: 'Artwork upload failed' });
  }
};
