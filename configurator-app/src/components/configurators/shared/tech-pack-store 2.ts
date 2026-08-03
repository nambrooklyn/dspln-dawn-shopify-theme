/**
 * Client for the versioned tech-pack store (netlify/functions/tech-packs.mjs).
 *
 * After a tech pack PDF is generated, the bytes are frozen server-side as an
 * immutable version (v1, v2, ...) so the factory portal and order audits can
 * always retrieve exactly what was produced. Netlify function bodies cap at
 * ~6MB, so the PDF is uploaded in base64 chunks and assembled server-side.
 */

// ~3MB binary per part -> ~4.1MB base64 body: comfortable headroom under the
// ~6MB function body limit even with JSON envelope overhead.
const PART_BINARY_BYTES = 3_000_000;

export interface StoredTechPack {
  version: number;
  byteSize: number;
}

function bytesToBase64(bytes: Uint8Array): string {
  // Convert in slices — String.fromCharCode(...whole) overflows the argument
  // limit on multi-megabyte arrays.
  let binary = '';
  const SLICE = 0x8000;
  for (let i = 0; i < bytes.length; i += SLICE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + SLICE));
  }
  return btoa(binary);
}

async function postJson<T>(body: unknown): Promise<T> {
  const response = await fetch('/api/tech-packs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

/**
 * Store a generated tech-pack PDF as a new immutable version for its design.
 * Returns the stored version, or null if storage failed — storage is a
 * best-effort archival step and must never block the user's download.
 */
export async function storeTechPackPdf({
  blob,
  designId,
  source,
  orderNumber,
  fileName,
}: {
  blob: Blob;
  designId: string;
  source?: string;
  orderNumber?: string;
  fileName?: string;
}): Promise<StoredTechPack | null> {
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!bytes.length) return null;
    const totalParts = Math.max(1, Math.ceil(bytes.length / PART_BINARY_BYTES));

    const begin = await postJson<{ data: { uploadId: string } }>({
      action: 'begin',
      designId,
      source,
      orderNumber,
      fileName,
      totalParts,
      byteSize: bytes.length,
    });
    const uploadId = begin.data.uploadId;

    for (let part = 0; part < totalParts; part += 1) {
      const slice = bytes.subarray(
        part * PART_BINARY_BYTES,
        (part + 1) * PART_BINARY_BYTES,
      );
      await postJson({
        action: 'part',
        designId,
        uploadId,
        part,
        dataBase64: bytesToBase64(slice),
      });
    }

    const done = await postJson<{
      data: { version: number; byteSize: number };
    }>({
      action: 'finalize',
      designId,
      uploadId,
    });
    return done.data;
  } catch (error) {
    console.error('[tech-pack-store] failed to store tech pack', error);
    return null;
  }
}
