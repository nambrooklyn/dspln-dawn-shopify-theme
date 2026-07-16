import { connectLambda, getStore } from '@netlify/blobs';

const PDF_STORE_NAME = 'dspln-tech-pack-pdfs';
const DESIGN_STORE_NAME = 'dspln-customer-designs';
const MAX_CHUNK_BYTES = 3_750_000;
const MAX_PARTS = 48;
const ID_PATTERN = /^[a-z0-9_-]{8,160}$/i;
const UPLOAD_PATTERN = /^[a-f0-9-]{16,64}$/i;

const response = (statusCode, body, headers = {}, isBase64Encoded = false) => ({
  statusCode,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Expose-Headers':
      'Content-Type, Content-Length, X-DSPLN-Tech-Pack-Parts, X-DSPLN-Tech-Pack-Filename',
    ...headers,
  },
  body,
  isBase64Encoded,
});

const jsonResponse = (statusCode, body) =>
  response(statusCode, JSON.stringify(body), { 'Content-Type': 'application/json' });

const manifestKey = (id) => `orders/${id}/manifest.json`;
const chunkKey = (id, uploadId, part) =>
  `uploads/${id}/${uploadId}/${part}.bin`;
const lookupKey = (id) => `lookup/${id}.json`;

const safeParse = (value) => {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
};

function safeFilename(value, fallback) {
  const clean = String(value || '')
    .replace(/[^a-z0-9._-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120);
  return clean.toLowerCase().endsWith('.pdf') ? clean : fallback;
}

async function designForId(id) {
  const store = getStore(DESIGN_STORE_NAME);
  const lookup = await store.get(lookupKey(id), { type: 'json' });
  if (!lookup?.key) return null;
  return store.get(lookup.key, { type: 'json' });
}

function manifestHeaders(manifest) {
  const filename = safeFilename(manifest.filename, `${manifest.id}_tech-pack.pdf`);
  return {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Type': 'application/pdf',
    'Content-Length': String(manifest.byteLength),
    'X-DSPLN-Tech-Pack': 'saved',
    'X-DSPLN-Tech-Pack-Parts': String(manifest.parts),
    'X-DSPLN-Tech-Pack-Filename': filename,
  };
}

async function serveStoredPdf(event, store, id) {
  const manifest = await store.get(manifestKey(id), { type: 'json' });
  if (!manifest) return response(404, 'Tech Pack not found');

  if (event.httpMethod === 'HEAD') {
    return response(200, '', manifestHeaders(manifest));
  }

  const part = Number(event.queryStringParameters?.part);
  if (!Number.isInteger(part) || part < 0 || part >= manifest.parts) {
    return jsonResponse(200, {
      id: manifest.id,
      parts: manifest.parts,
      filename: manifest.filename,
      byteLength: manifest.byteLength,
    });
  }

  const entry = await store.getWithMetadata(
    chunkKey(id, manifest.uploadId, part),
    { type: 'arrayBuffer' },
  );
  if (!entry?.data) return response(404, 'Tech Pack part not found');
  const headers = {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(entry.data.byteLength),
  };

  return response(
    200,
    Buffer.from(entry.data).toString('base64'),
    headers,
    true,
  );
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return response(204, '');
  if (!['GET', 'HEAD', 'POST'].includes(event.httpMethod)) {
    return response(405, 'Method not allowed');
  }

  const id = event.queryStringParameters?.id ?? '';
  if (!ID_PATTERN.test(id)) return response(400, 'Invalid design id');

  try {
    connectLambda(event);
    const store = getStore(PDF_STORE_NAME);

    if (event.httpMethod === 'GET' || event.httpMethod === 'HEAD') {
      return await serveStoredPdf(event, store, id);
    }

    // A manifest is written only after every chunk is safely stored. Once the
    // manifest exists, this production document is immutable.
    const existing = await store.get(manifestKey(id), { type: 'json' });
    if (existing) {
      return jsonResponse(200, {
        id,
        parts: existing.parts,
        filename: existing.filename,
      });
    }

    const design = await designForId(id);
    if (!design) return jsonResponse(404, { error: 'Design not found' });
    if (!design.orderName && !design.shopifyOrderId) {
      return jsonResponse(403, { error: 'A placed order is required' });
    }

    const mode = event.queryStringParameters?.mode;
    if (mode === 'chunk') {
      const uploadId = event.queryStringParameters?.upload ?? '';
      const part = Number(event.queryStringParameters?.part);
      const parts = Number(event.queryStringParameters?.parts);
      if (
        !UPLOAD_PATTERN.test(uploadId) ||
        !Number.isInteger(part) ||
        !Number.isInteger(parts) ||
        parts < 1 ||
        parts > MAX_PARTS ||
        part < 0 ||
        part >= parts
      ) {
        return jsonResponse(400, { error: 'Invalid Tech Pack chunk' });
      }

      const bytes = event.isBase64Encoded
        ? Buffer.from(event.body ?? '', 'base64')
        : Buffer.from(event.body ?? '', 'binary');
      if (!bytes.byteLength || bytes.byteLength > MAX_CHUNK_BYTES) {
        return jsonResponse(413, {
          error: 'Tech Pack chunk is too large',
          maximumBytes: MAX_CHUNK_BYTES,
        });
      }
      if (part === 0 && bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
        return jsonResponse(400, { error: 'Invalid PDF file' });
      }

      const arrayBuffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      );
      await store.set(chunkKey(id, uploadId, part), arrayBuffer, {
        metadata: { id, uploadId, part, parts, byteLength: bytes.byteLength },
      });
      return jsonResponse(201, { saved: true, part, parts });
    }

    if (mode === 'complete') {
      const payload = safeParse(event.body);
      const uploadId = String(payload.uploadId ?? '');
      const parts = Number(payload.parts);
      if (
        !UPLOAD_PATTERN.test(uploadId) ||
        !Number.isInteger(parts) ||
        parts < 1 ||
        parts > MAX_PARTS
      ) {
        return jsonResponse(400, { error: 'Invalid Tech Pack upload' });
      }

      let byteLength = 0;
      for (let part = 0; part < parts; part += 1) {
        const metadata = await store.getMetadata(chunkKey(id, uploadId, part));
        if (!metadata || metadata.metadata?.parts !== parts) {
          return jsonResponse(409, { error: `Tech Pack part ${part + 1} is missing` });
        }
        byteLength += Number(metadata.metadata.byteLength) || 0;
      }

      const fallbackFilename = `${String(design.orderName || id).replace(
        /[^a-z0-9_-]+/gi,
        '_',
      )}_tech-pack.pdf`;
      const manifest = {
        id,
        uploadId,
        parts,
        filename: safeFilename(payload.filename, fallbackFilename),
        byteLength,
        orderName: design.orderName ?? null,
        createdAt: new Date().toISOString(),
      };
      await store.setJSON(manifestKey(id), manifest);
      return jsonResponse(201, {
        id,
        parts,
        filename: manifest.filename,
      });
    }

    return jsonResponse(400, { error: 'Tech Pack upload mode is required' });
  } catch (error) {
    console.error('[tech-pack-pdf]', error);
    return jsonResponse(500, { error: 'Tech Pack storage failed' });
  }
};
