import { getStore } from '@netlify/blobs';

/**
 * Versioned, frozen tech-pack storage (plan "C").
 *
 * The design record is the source of truth for WHAT a garment is; this store
 * freezes WHAT THE FACTORY WAS SENT. Every generated tech-pack PDF is stored
 * as an immutable version (v1, v2, ...) keyed by design id — regenerating a
 * pack never overwrites an earlier one, so an order can always be audited
 * against the exact bytes the factory received.
 *
 * This is a Functions 2.0 handler (default export + config.path) because:
 * - responses can STREAM, so a ~10MB PDF download doesn't hit the ~6MB
 *   buffered-response cap of v1 handlers;
 * - request bodies are still capped (~6MB), so uploads arrive in base64
 *   chunks (begin -> part... -> finalize) and are concatenated server-side.
 *
 * API (all JSON unless noted):
 *   POST {action:'begin', designId, source?, orderNumber?, fileName?, totalParts, byteSize?}
 *     -> {uploadId}
 *   POST {action:'part', designId, uploadId, part, dataBase64}
 *     -> {stored: part}
 *   POST {action:'finalize', designId, uploadId}
 *     -> {version, byteSize}
 *   GET ?list=1                 -> {data:{packs:[summary...]}}
 *   GET ?id=<designId>          -> {data:{pack:{...versions with file URLs}}}
 *   GET ?id=<designId>&v=<N>    -> the PDF itself (streamed, inline)
 */

const STORE_NAME = 'dspln-tech-packs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const cleanId = (value) => {
  const id = String(value || '').trim();
  return /^[\w.-]{1,120}$/.test(id) ? id : null;
};

const indexKey = (designId) => `packs/${designId}/index.json`;
const versionKey = (designId, v) => `packs/${designId}/v${v}.pdf`;
const summaryKey = (designId) => `pack-list/${designId}.json`;
const partKey = (designId, uploadId, part) =>
  `uploads/${designId}/${uploadId}/part-${String(part).padStart(4, '0')}`;
const uploadMetaKey = (designId, uploadId) =>
  `uploads/${designId}/${uploadId}/meta.json`;

const MAX_PARTS = 24; // 24 * ~3MB ≈ 72MB ceiling — far above any real pack

async function listSummaries(store) {
  const packs = [];
  let cursor;
  do {
    const result = await store.list({ prefix: 'pack-list/', cursor });
    const records = await Promise.all(
      result.blobs.map((blob) => store.get(blob.key, { type: 'json' })),
    );
    packs.push(...records.filter(Boolean));
    cursor = result.cursor;
  } while (cursor);
  return packs;
}

function fileUrl(request, designId, v) {
  const url = new URL(request.url);
  return `${url.origin}/api/tech-packs?id=${encodeURIComponent(designId)}&v=${v}`;
}

function withUrls(request, index) {
  return {
    ...index,
    versions: (index.versions || []).map((entry) => ({
      ...entry,
      url: fileUrl(request, index.designId, entry.version),
    })),
  };
}

async function handlePost(request) {
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  const designId = cleanId(payload.designId);
  if (!designId) return json(400, { error: 'designId is required' });

  if (payload.action === 'begin') {
    const totalParts = Number(payload.totalParts);
    if (!Number.isInteger(totalParts) || totalParts < 1 || totalParts > MAX_PARTS) {
      return json(400, { error: `totalParts must be 1-${MAX_PARTS}` });
    }
    const uploadId = `up_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    await store.setJSON(uploadMetaKey(designId, uploadId), {
      designId,
      uploadId,
      totalParts,
      source: payload.source || null,
      orderNumber: payload.orderNumber || null,
      fileName: payload.fileName || null,
      startedAt: new Date().toISOString(),
    });
    return json(200, { data: { uploadId } });
  }

  if (payload.action === 'part') {
    const uploadId = cleanId(payload.uploadId);
    const part = Number(payload.part);
    if (!uploadId || !Number.isInteger(part) || part < 0 || part >= MAX_PARTS) {
      return json(400, { error: 'uploadId and part are required' });
    }
    const meta = await store.get(uploadMetaKey(designId, uploadId), {
      type: 'json',
    });
    if (!meta) return json(404, { error: 'Unknown upload' });
    const bytes = Buffer.from(String(payload.dataBase64 || ''), 'base64');
    if (!bytes.length) return json(400, { error: 'Empty part' });
    await store.set(partKey(designId, uploadId, part), bytes.buffer);
    return json(200, { data: { stored: part, byteSize: bytes.length } });
  }

  if (payload.action === 'finalize') {
    const uploadId = cleanId(payload.uploadId);
    if (!uploadId) return json(400, { error: 'uploadId is required' });
    const meta = await store.get(uploadMetaKey(designId, uploadId), {
      type: 'json',
    });
    if (!meta) return json(404, { error: 'Unknown upload' });

    const chunks = [];
    for (let part = 0; part < meta.totalParts; part += 1) {
      const chunk = await store.get(partKey(designId, uploadId, part), {
        type: 'arrayBuffer',
      });
      if (!chunk) return json(400, { error: `Missing part ${part}` });
      chunks.push(Buffer.from(chunk));
    }
    const pdf = Buffer.concat(chunks);
    // Cheap integrity check: every real pack starts with the PDF magic.
    if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return json(400, { error: 'Assembled file is not a PDF' });
    }

    const index = (await store.get(indexKey(designId), { type: 'json' })) || {
      designId,
      source: meta.source,
      versions: [],
    };
    // Versions are immutable: the next version number is one past the highest
    // ever issued (never reuse a number, even if listing order changed).
    const version =
      index.versions.reduce((max, entry) => Math.max(max, entry.version), 0) + 1;
    const createdAt = new Date().toISOString();
    const entry = {
      version,
      byteSize: pdf.length,
      createdAt,
      orderNumber: meta.orderNumber,
      fileName: meta.fileName || `${designId}_v${version}.pdf`,
      source: meta.source,
    };

    await store.set(versionKey(designId, version), pdf.buffer);
    index.source = index.source || meta.source;
    index.orderNumber = meta.orderNumber || index.orderNumber || null;
    index.versions = [...index.versions, entry];
    index.updatedAt = createdAt;
    await store.setJSON(indexKey(designId), index);
    await store.setJSON(summaryKey(designId), {
      designId,
      source: index.source,
      orderNumber: index.orderNumber,
      latestVersion: version,
      versionCount: index.versions.length,
      latestByteSize: pdf.length,
      updatedAt: createdAt,
    });

    // Best-effort cleanup of the upload scratch space.
    const cleanup = [uploadMetaKey(designId, uploadId)];
    for (let part = 0; part < meta.totalParts; part += 1) {
      cleanup.push(partKey(designId, uploadId, part));
    }
    await Promise.all(cleanup.map((key) => store.delete(key).catch(() => {})));

    return json(200, { data: { version, byteSize: pdf.length } });
  }

  return json(400, { error: 'Unknown action' });
}

export default async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: CORS });
  }

  try {
    if (request.method === 'POST') return handlePost(request);

    if (request.method === 'GET') {
      const store = getStore({ name: STORE_NAME, consistency: 'strong' });
      const url = new URL(request.url);

      if (url.searchParams.get('list') === '1') {
        const packs = await listSummaries(store);
        packs.sort((a, b) =>
          String(b.updatedAt).localeCompare(String(a.updatedAt)),
        );
        return json(200, { data: { packs } });
      }

      const designId = cleanId(url.searchParams.get('id'));
      if (!designId) return json(400, { error: 'id is required' });

      const index = await store.get(indexKey(designId), { type: 'json' });
      if (!index) return json(404, { error: 'No stored tech pack' });

      const versionParam = url.searchParams.get('v');
      if (versionParam == null) {
        return json(200, { data: { pack: withUrls(request, index) } });
      }

      const version = Number(versionParam);
      const entry = index.versions.find((item) => item.version === version);
      if (!entry) return json(404, { error: 'Version not found' });

      const stream = await store.get(versionKey(designId, version), {
        type: 'stream',
      });
      if (!stream) return json(404, { error: 'Stored file missing' });

      return new Response(stream, {
        status: 200,
        headers: {
          ...CORS,
          'Content-Type': 'application/pdf',
          'Content-Length': String(entry.byteSize),
          'Content-Disposition': `inline; filename="${String(
            entry.fileName,
          ).replace(/"/g, '')}"`,
          // Versions are immutable, so aggressive caching is safe.
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (error) {
    console.error('[tech-packs]', error);
    return json(500, { error: 'Tech pack storage failed' });
  }
};

export const config = {
  path: '/api/tech-packs',
};
