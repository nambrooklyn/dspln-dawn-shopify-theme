import { connectLambda, getStore } from '@netlify/blobs';

const STORE_NAME = 'dspln-preview-images';
const KEY_PATTERN = /^gi\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]+\.(?:jpg|png|webp)$/i;

const response = (statusCode, body, headers = {}, isBase64Encoded = false) => ({
  statusCode,
  headers: {
    'Access-Control-Allow-Origin': '*',
    ...headers,
  },
  body,
  isBase64Encoded,
});

export const handler = async (event) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
    return response(405, 'Method not allowed');
  }

  const key = event.queryStringParameters?.key ?? '';
  if (!KEY_PATTERN.test(key)) {
    return response(400, 'Invalid preview image key');
  }

  try {
    connectLambda(event);

    const store = getStore(STORE_NAME);
    const entry = await store.getWithMetadata(key, { type: 'arrayBuffer' });

    if (!entry?.data) {
      return response(404, 'Preview image not found');
    }

    const contentType =
      typeof entry.metadata.contentType === 'string'
        ? entry.metadata.contentType
        : 'image/jpeg';
    const body = Buffer.from(entry.data).toString('base64');

    return response(
      200,
      event.httpMethod === 'HEAD' ? '' : body,
      {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Type': contentType,
        'Content-Length': String(Buffer.byteLength(body, 'base64')),
      },
      event.httpMethod !== 'HEAD',
    );
  } catch (error) {
    console.error('[preview-image]', error);
    return response(500, 'Preview image failed');
  }
};
