import { randomUUID, timingSafeEqual } from 'node:crypto';

import { connectLambda, getStore } from '@netlify/blobs';

import { emailIndexKey, writeEmailIndex } from '../lib/design-ownership.mjs';

const STORE_NAME = 'dspln-customer-designs';

// Store-wide listings (all designs / the studio summary) are DSPLN-internal
// (key configured via DSPLN_ADMIN_API_KEY; requires a deploy to apply):
// they require the shared admin key when one is configured. Per-customer
// queries (ownerKey / customerEmail) stay open for the Locker.
function adminKeyOk(event) {
  const expected = process.env.DSPLN_ADMIN_API_KEY;
  if (!expected) return true; // not configured yet — behave as before
  const given =
    event.headers['x-dspln-admin-key'] ?? event.headers['X-Dspln-Admin-Key'] ?? '';
  const a = Buffer.from(String(given));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

const textResponse = (statusCode, body, headers = {}, isBase64Encoded = false) => ({
  statusCode,
  headers: {
    'Access-Control-Allow-Origin': '*',
    ...headers,
  },
  body,
  isBase64Encoded,
});

const htmlResponse = (statusCode, body) =>
  textResponse(statusCode, body, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'private, max-age=60',
  });

const redirectResponse = (location) => ({
  statusCode: 302,
  headers: {
    'Access-Control-Allow-Origin': '*',
    Location: location,
  },
  body: '',
});

const cleanPathPart = (value) =>
  encodeURIComponent(String(value || 'unknown')).replace(/%/g, '~');

const designKey = ({ ownerKey, productHandle, id }) =>
  `designs/${cleanPathPart(ownerKey)}/${cleanPathPart(productHandle || 'customgi')}/${id}.json`;

const lookupKey = (id) => `lookup/${id}.json`;

// Standalone Artwork Studio saves live in the SAME store and under the same
// ownership conventions as designs — they are just not attached to a garment.
// Keeping them here means the Locker's Uploads listing can merge both sources
// in one request instead of the frontend stitching two endpoints together.
const artworkKey = ({ ownerKey, id }) =>
  `artwork/${cleanPathPart(ownerKey)}/${id}.json`;

const REVISION_TYPES = ['upload', 'cleanup', 'manual-edit', 'ai-edit'];

const cleanText = (value, max = 200) => String(value ?? '').trim().slice(0, max);

const cleanDimension = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= 20000
    ? Math.round(number)
    : null;
};

// Artwork bytes go through upload-artwork / Shopify — the record only ever
// stores the hosted URL. Anything that is not one of those hosts (a data URL,
// an attacker-supplied endpoint used later as an AI edit source) is rejected,
// matching artwork-agent's isAllowedArtworkUrl.
const isAllowedArtworkUrl = (rawUrl, event) => {
  try {
    const url = new URL(String(rawUrl));
    if (url.protocol !== 'https:') return false;
    const host = event.headers.host ?? event.headers.Host;
    if (url.host === host && url.pathname === '/.netlify/functions/preview-image') {
      return true;
    }
    return url.host === 'cdn.shopify.com';
  } catch {
    return false;
  }
};

// Stable identity for an Uploads row so a standalone artwork record and a
// design-embedded logo pointing at the SAME hosted image collapse into one
// entry. preview-image URLs are identified by their blob key; Shopify CDN
// URLs by their path (the query string carries only resize params).
const uploadDedupeKey = (url) => {
  try {
    const parsed = new URL(String(url));
    const blobKey = parsed.searchParams.get('key');
    if (blobKey) return `blob:${blobKey}`;
    if (parsed.host === 'cdn.shopify.com') return `shopify:${parsed.pathname}`;
    const designId = parsed.searchParams.get('id');
    const asset = parsed.searchParams.get('asset');
    if (designId && asset) return `design:${designId}:${asset}`;
    return `url:${parsed.origin}${parsed.pathname}`;
  } catch {
    return `raw:${String(url)}`;
  }
};

// Studio designs get a lightweight index entry so the portal's Studio tab can
// page through ONLY studio designs. Filtering the main listing after
// pagination hides studio saves behind pages of customer records.
const studioIndexKey = (id) => `studio-index/${id}.json`;
const LEGACY_SHOPIFY_PRODUCT_HANDLE_ALIASES = {
  'mens-custom-gi-suit-configurator-test': 'customgi',
};
const LEGACY_SHOPIFY_PRODUCT_PATH_ALIASES = {
  '/products/mens-custom-gi-suit-configurator-test': '/products/customgi',
};
const normalizeShopifyProductHandle = (handle) =>
  LEGACY_SHOPIFY_PRODUCT_HANDLE_ALIASES[handle] || handle || 'customgi';
const normalizeShopifyProductPath = (path) =>
  LEGACY_SHOPIFY_PRODUCT_PATH_ALIASES[path] || path || '/products/customgi';
const SHOPIFY_GI_PRODUCT_PATH = normalizeShopifyProductPath(
  process.env.SHOPIFY_GI_PRODUCT_PATH,
);

const absoluteApiUrl = (event, params) => {
  const host = event.headers.host ?? event.headers.Host;
  const protocol =
    event.headers['x-forwarded-proto'] ??
    event.headers['X-Forwarded-Proto'] ??
    'https';
  const query = new URLSearchParams(params);
  return `${protocol}://${host}/api/customer-designs?${query.toString()}`;
};

const absoluteAppUrl = (event, path, params = {}) => {
  const host = event.headers.host ?? event.headers.Host;
  const protocol =
    event.headers['x-forwarded-proto'] ??
    event.headers['X-Forwarded-Proto'] ??
    'https';
  const url = new URL(`${protocol}://${host}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return url.toString();
};

// The storefront only mounts the configurator on the product's alternate
// template (?view=...). Template names follow the design source:
// dspln-<garment>-configurator -> <garment>-configurator-product-page,
// and rashguard sources are already the bare garment name.
const designViewTemplate = (record) => {
  const source = record?.configData?.source;
  if (!source) return 'gi-configurator-product-page';
  const garment = String(source)
    .replace(/^dspln-/, '')
    .replace(/-configurator$/, '');
  return `${garment}-configurator-product-page`;
};

const shopifyDesignUrl = (record) => {
  const shopHost =
    record.shopDomain && !record.shopDomain.endsWith('.myshopify.com')
      ? record.shopDomain
      : 'dspln.com';
  const productPath = record.productHandle
    ? `/products/${encodeURIComponent(
        normalizeShopifyProductHandle(record.productHandle),
      )}`
    : SHOPIFY_GI_PRODUCT_PATH;
  const url = new URL(`https://${shopHost}${productPath}`);
  url.searchParams.set('design', record.id);
  url.searchParams.set('view', designViewTemplate(record));
  return url.toString();
};

const safeParse = (value) => {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
};

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const dataUrlInfo = (dataUrl) => {
  const match =
    typeof dataUrl === 'string'
      ? dataUrl.match(/^data:([^;]+);base64,([a-zA-Z0-9+/=\s]+)$/)
      : null;
  if (!match) return null;
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  return { contentType: match[1], bytes };
};

const shopifyGraphql = async (shopDomain, token, query, variables) => {
  const response = await fetch(
    `https://${shopDomain}/admin/api/2025-04/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
    },
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const json = await response.json();
  if (json.errors?.length) {
    throw new Error(JSON.stringify(json.errors));
  }
  return json.data;
};

const uploadArtworkToShopify = async ({ shopDomain, token, filename, dataUrl }) => {
  const info = dataUrlInfo(dataUrl);
  if (!shopDomain || !token || !info) return null;

  const staged = await shopifyGraphql(
    shopDomain,
    token,
    `mutation StagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }`,
    {
      input: [
        {
          resource: 'FILE',
          filename,
          mimeType: info.contentType,
          httpMethod: 'POST',
        },
      ],
    },
  );

  const target = staged.stagedUploadsCreate?.stagedTargets?.[0];
  const stagedErrors = staged.stagedUploadsCreate?.userErrors || [];
  if (!target || stagedErrors.length) {
    throw new Error(JSON.stringify(stagedErrors));
  }

  const form = new FormData();
  target.parameters.forEach((parameter) => {
    form.append(parameter.name, parameter.value);
  });
  form.append(
    'file',
    new Blob([info.bytes], { type: info.contentType }),
    filename,
  );

  const uploadResponse = await fetch(target.url, {
    method: 'POST',
    body: form,
  });
  if (!uploadResponse.ok) {
    throw new Error(await uploadResponse.text());
  }

  const created = await shopifyGraphql(
    shopDomain,
    token,
    `mutation FileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          fileStatus
          alt
          ... on MediaImage {
            image { url }
          }
          ... on GenericFile {
            url
          }
        }
        userErrors { field message }
      }
    }`,
    {
      files: [
        {
          originalSource: target.resourceUrl,
          filename,
          contentType: 'IMAGE',
          alt: `DSPLN custom gi artwork - ${filename}`,
          duplicateResolutionMode: 'APPEND_UUID',
        },
      ],
    },
  );

  const file = created.fileCreate?.files?.[0];
  const createErrors = created.fileCreate?.userErrors || [];
  if (createErrors.length) {
    throw new Error(JSON.stringify(createErrors));
  }

  return file?.image?.url || file?.url || null;
};

async function enrichArtworkLinks(record) {
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  const shopDomain =
    process.env.SHOPIFY_SHOP_DOMAIN || record.shopDomain || 'f39242.myshopify.com';
  if (!token || !shopDomain) return record;

  const images = record.configData?.images || {};
  const jobs = [];

  ['kimono', 'pant'].forEach((part) => {
    Object.entries(images[part] || {}).forEach(([slot, image]) => {
      if (!image || image.shopifyUrl || !image.dataUrl) return;
      jobs.push(
        uploadArtworkToShopify({
          shopDomain,
          token,
          filename: image.filename || `${part}-${slot}.png`,
          dataUrl: image.dataUrl,
        })
          .then((url) => {
            if (url) image.shopifyUrl = url;
          })
          .catch((error) => {
            console.error('[customer-designs] Shopify artwork upload failed', {
              part,
              slot,
              error,
            });
          }),
      );
    });
  });

  await Promise.all(jobs);
  return record;
}

async function getRecordById(store, id) {
  const lookup = await store.get(lookupKey(id), { type: 'json' });
  if (!lookup?.key) return null;
  return store.get(lookup.key, { type: 'json' });
}

function withLinks(event, record) {
  const designUrl = shopifyDesignUrl(record);
  // Derive the configurator URL from the request host so it points at the
  // real deploy (previously hardcoded to http://127.0.0.1:3002 — a dev URL
  // that must never ship). absoluteAppUrl skips falsy params.
  const netlifyDesignUrl = absoluteAppUrl(event, '/configurator/gi', {
    shopifyTest: '1',
    design: record.id,
    shop: record.shopDomain,
    customerId: record.shopifyCustomerId,
    customerEmail: record.customerEmail,
    productId: record.productId,
    productHandle: record.productHandle,
  });
  const productionUrl = absoluteApiUrl(event, { id: record.id });
  const artwork = [];
  const images = record.configData?.images || {};

  Object.entries(images.kimono || {}).forEach(([slot, image]) => {
    if (!image) return;
    const url = image.shopifyUrl || absoluteApiUrl(event, { id: record.id, asset: `kimono:${slot}` });
      artwork.push({
      part: 'kimono',
      slot,
      filename: image.filename,
      url,
    });
  });
  Object.entries(images.pant || {}).forEach(([slot, image]) => {
    if (!image) return;
    const url = image.shopifyUrl || absoluteApiUrl(event, { id: record.id, asset: `pant:${slot}` });
    artwork.push({
      part: 'pant',
      slot,
      filename: image.filename,
      url,
    });
  });

  // Rashguard-family saves keep layer images as an ARRAY (see
  // offloadDraftImages in rashguard-cloud-designs.ts): hosted URL in dataUrl,
  // or a shrunk inline fallback served via ?asset=layer:<id>. Without this
  // branch a rashguard's logos never reach the Uploads tab.
  if (Array.isArray(images)) {
    const layerTargets = new Map(
      (record.configData?.spec?.artworkLayers ?? [])
        .filter((layer) => layer?.id)
        .map((layer) => [layer.id, layer.target ?? null]),
    );
    images.forEach((image) => {
      if (!image?.dataUrl) return;
      const hosted = String(image.dataUrl);
      const url = hosted.startsWith('http')
        ? hosted
        : absoluteApiUrl(event, { id: record.id, asset: `layer:${image.id}` });
      artwork.push({
        part: 'layer',
        slot: layerTargets.get(image.id) ?? null,
        filename: image.filename,
        url,
      });
    });
  }

  return {
    ...record,
    designUrl,
    netlifyDesignUrl,
    productionUrl,
    artwork,
  };
}

function logoEntriesForRecord(event, record) {
  const linked = withLinks(event, record);
  return linked.artwork.map((art) => ({
    ...art,
    source: 'design',
    designId: record.id,
    designName: record.name || 'Saved Gi Design',
    createdAt: record.createdAt ?? null,
    updatedAt: record.updatedAt,
    dedupeKey: uploadDedupeKey(art.url),
  }));
}

// A standalone artwork record rendered in the SAME shape the Uploads list
// already consumes, so the frontend keeps one row type.
function uploadEntryForArtwork(record) {
  return {
    source: 'artwork',
    artworkId: record.id,
    part: null,
    slot: null,
    filename: record.filename,
    title: record.title,
    url: record.url,
    width: record.width ?? null,
    height: record.height ?? null,
    parentId: record.parentId ?? null,
    revisionType: record.revisionType ?? null,
    designId: null,
    designName: null,
    createdAt: record.createdAt ?? null,
    updatedAt: record.updatedAt ?? null,
    dedupeKey: uploadDedupeKey(record.url),
  };
}

// Standalone artwork wins the merge (it carries the id, title and dimensions);
// a design logo pointing at the same hosted image only contributes its garment
// placement back onto that row.
function mergeUploadEntries(entries) {
  const merged = new Map();

  entries.forEach((entry) => {
    const existing = merged.get(entry.dedupeKey);
    if (!existing) {
      merged.set(entry.dedupeKey, entry);
      return;
    }
    const primary = existing.source === 'artwork' ? existing : entry;
    const secondary = existing.source === 'artwork' ? entry : existing;
    merged.set(entry.dedupeKey, {
      ...primary,
      part: primary.part ?? secondary.part ?? null,
      slot: primary.slot ?? secondary.slot ?? null,
      designId: primary.designId ?? secondary.designId ?? null,
      designName: primary.designName ?? secondary.designName ?? null,
      updatedAt:
        String(secondary.updatedAt || '') > String(primary.updatedAt || '')
          ? secondary.updatedAt
          : primary.updatedAt,
    });
  });

  return [...merged.values()].sort((a, b) =>
    String(b.updatedAt).localeCompare(String(a.updatedAt)),
  );
}

async function listRecords(store, prefix) {
  const designs = [];
  let cursor;

  do {
    const result = await store.list({ prefix, cursor });
    const records = await Promise.all(
      result.blobs.map((blob) => store.get(blob.key, { type: 'json' })),
    );
    designs.push(...records.filter(Boolean));
    cursor = result.cursor;
  } while (cursor);

  return designs;
}

async function listLogoRecords(store, query) {
  if (query.ownerKey) {
    const ownerPrefix = `designs/${cleanPathPart(query.ownerKey)}/`;
    return listRecords(store, ownerPrefix);
  }

  if (query.customerEmail) {
    const allRecords = await listRecords(store, 'designs/');
    const email = String(query.customerEmail).trim().toLowerCase();
    return allRecords.filter(
      (record) =>
        String(record?.customerEmail || '').trim().toLowerCase() === email,
    );
  }

  return [];
}

// Artwork ownership is proven by ownerKey ONLY — never by customerEmail, which
// a caller can guess. An email-only Uploads query therefore returns just the
// design-embedded logos it already returned before.
async function listArtworkRecords(store, ownerKey) {
  if (!ownerKey) return [];
  const records = await listRecords(store, `artwork/${cleanPathPart(ownerKey)}/`);
  return records.filter((record) => record?.kind === 'artwork');
}

// Guest work is claimed by POSSESSION of the guest token — the caller proves
// authorship by still holding the token the configurator minted in that
// browser's localStorage. Email is NEVER used for matching: an email is not
// proof of ownership. The only records a claim can touch are the ones under
// `guest:{token}` for the tokens presented, and they can only ever move INTO
// the ownerKey the caller supplied, so this never widens the (pre-existing)
// unverified-ownerKey surface into reading another shopify: owner's records.
const GUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,120}$/;

const cleanGuestTokens = (value) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  value.forEach((raw) => {
    const token = String(raw ?? '').trim();
    if (token && GUEST_TOKEN_PATTERN.test(token)) seen.add(token);
  });
  return [...seen];
};

const shopifyCustomerIdFromOwnerKey = (ownerKey) => {
  const parts = String(ownerKey).split(':');
  return parts.length === 3 && parts[0] === 'shopify' ? parts[2] : null;
};

// Re-keys one record and repoints its lookup entry. The id never changes, so
// share links and `lookup/{id}.json` stay valid. Writing the new blob before
// deleting the old one means a mid-flight failure leaves the record readable
// under the guest key (the next claim retries it) rather than losing it.
async function moveClaimedRecord(store, oldKey, newKey, record) {
  await store.setJSON(newKey, record);
  await store.setJSON(lookupKey(record.id), { key: newKey });
  if (record.configData?.studio === true) {
    await store.setJSON(studioIndexKey(record.id), { key: newKey });
  }
  if (oldKey !== newKey) await store.delete(oldKey);
}

async function claimGuestRecords(store, ownerKey, tokens) {
  const shopifyCustomerId = shopifyCustomerIdFromOwnerKey(ownerKey);
  let designs = 0;
  let artwork = 0;
  let failed = 0;

  for (const token of tokens) {
    const guestKey = `guest:${token}`;
    const prefixes = [
      { prefix: `designs/${cleanPathPart(guestKey)}/`, kind: 'design' },
      { prefix: `artwork/${cleanPathPart(guestKey)}/`, kind: 'artwork' },
    ];

    for (const { prefix, kind } of prefixes) {
      let cursor;
      do {
        const page = await store.list({ prefix, cursor });
        for (const blob of page.blobs) {
          try {
            const record = await store.get(blob.key, { type: 'json' });
            // An empty or already-claimed token lists nothing — a no-op, not
            // an error. A record whose ownerKey no longer matches the guest
            // key it sits under is left alone.
            if (!record?.id || record.ownerKey !== guestKey) continue;
            const claimed = {
              ...record,
              ownerKey,
              shopifyCustomerId: shopifyCustomerId ?? record.shopifyCustomerId ?? null,
              guestToken: null,
              updatedAt: record.updatedAt ?? new Date().toISOString(),
            };
            const newKey =
              kind === 'artwork'
                ? artworkKey(claimed)
                : designKey(claimed);
            await moveClaimedRecord(store, blob.key, newKey, claimed);
            if (kind === 'artwork') artwork += 1;
            else designs += 1;
          } catch (error) {
            failed += 1;
            console.error('[customer-designs] claim failed', {
              key: blob.key,
              error,
            });
          }
        }
        cursor = page.cursor;
      } while (cursor);
    }
  }

  return { designs, artwork, failed, tokens: tokens.length };
}

function assetResponse(record, asset) {
  const [part, slot] = String(asset || '').split(':');
  const image =
    part === 'layer' && Array.isArray(record.configData?.images)
      ? record.configData.images.find((entry) => entry?.id === slot)
      : record.configData?.images?.[part]?.[slot];
  const match =
    typeof image?.dataUrl === 'string'
      ? image.dataUrl.match(/^data:([^;]+);base64,(.+)$/)
      : null;

  if (!match) return textResponse(404, 'Artwork not found');

  const filename = image.filename || `${part}-${slot}`;
  return textResponse(
    200,
    match[2],
    {
      'Content-Type': match[1],
      'Content-Disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=300',
    },
    true,
  );
}

function colorName(color) {
  return color?.name || color?.hex || '';
}

function productionPacketHtml(event, record) {
  const linked = withLinks(event, record);
  const spec = record.configData?.spec || {};
  const rows = [
    ['Kimono Size', spec.kimono?.size],
    ['Kimono Body', colorName(spec.kimono?.colors?.body)],
    ['Kimono Lapel', colorName(spec.kimono?.colors?.lapel)],
    ['Kimono Reinforcement', colorName(spec.kimono?.colors?.reinforcement)],
    ['Kimono Stitching', colorName(spec.kimono?.colors?.stitching)],
    ['Belt Color', colorName(spec.belt?.color)],
    ['Left Belt Text', spec.belt?.embroidery?.leftEnd || 'No Text'],
    ['Right Belt Text', spec.belt?.embroidery?.rightEnd || 'No Text'],
    ['Pant Size', spec.pant?.size],
    ['Pant Body', colorName(spec.pant?.colors?.body)],
    ['Pant Reinforcement', colorName(spec.pant?.colors?.reinforcement)],
    ['Pant Drawcord', colorName(spec.pant?.colors?.drawcord)],
    ['Pant Stitching', colorName(spec.pant?.colors?.stitching)],
  ].filter(([, value]) => value);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>DSPLN Production Design ${esc(record.id)}</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; color: #1f1f1f; background: #fff; }
      main { max-width: 1060px; margin: 0 auto; padding: 48px 28px; }
      h1 { font-size: 20px; letter-spacing: .16em; font-weight: 500; text-transform: uppercase; }
      h2 { margin-top: 34px; padding-top: 18px; border-top: 1px solid #ddd; font-size: 13px; letter-spacing: .14em; text-transform: uppercase; }
      .grid { display: grid; grid-template-columns: minmax(220px, 360px) 1fr; gap: 42px; align-items: start; }
      img { width: 100%; height: auto; object-fit: contain; }
      dl { display: grid; grid-template-columns: 180px 1fr; gap: 8px 18px; font-size: 13px; line-height: 1.45; }
      dt { color: #888; letter-spacing: .08em; text-transform: uppercase; }
      dd { margin: 0; }
      a { color: #842323; }
      .links { display: grid; gap: 12px; font-size: 14px; }
      @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } dl { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <main>
      <h1>${esc(record.name)} · ${esc(record.id)}</h1>
      <div class="grid">
        <section>
          ${record.thumbnailUrl ? `<img src="${esc(record.thumbnailUrl)}" alt="Design preview">` : ''}
        </section>
        <section>
          <h2>3D Design</h2>
          <p><a href="${esc(linked.designUrl)}" target="_top">Open editable 3D design</a></p>
          <h2>Customization</h2>
          <dl>
            ${rows.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value)}</dd>`).join('')}
          </dl>
          <h2>Artwork</h2>
          <div class="links">
            ${
              linked.artwork.length
                ? linked.artwork
                    .map(
                      (art) =>
                        `<a href="${esc(art.url)}" target="_blank" rel="noopener noreferrer">${esc(art.part)} ${esc(art.slot)} · ${esc(art.filename)}</a>`,
                    )
                    .join('')
                : '<span>No uploaded artwork on this design.</span>'
            }
          </div>
        </section>
      </div>
    </main>
  </body>
</html>`;
}

function yesNoLink(hasArtwork, link) {
  if (!hasArtwork) return 'NO';
  return link
    ? `<a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">YES</a>`
    : 'YES';
}

function artworkBySlot(linked) {
  return linked.artwork.reduce((acc, art) => {
    acc[`${art.part}:${art.slot}`] = art;
    return acc;
  }, {});
}

function techPackHtml(event, record) {
  const linked = withLinks(event, record);
  const spec = record.configData?.spec || {};
  const images = record.configData?.images || {};
  const artwork = artworkBySlot(linked);
  const kimonoImages = images.kimono || {};
  const pantImages = images.pant || {};
  const date = record.updatedAt || record.createdAt || new Date().toISOString();
  const colors = [
    ['Kimono Body', colorName(spec.kimono?.colors?.body)],
    ['Kimono Lapel', colorName(spec.kimono?.colors?.lapel)],
    ['Kimono Reinforcement', colorName(spec.kimono?.colors?.reinforcement)],
    ['Kimono Stitching', colorName(spec.kimono?.colors?.stitching)],
    ['Belt Color', colorName(spec.belt?.color)],
    ['Pant Body', colorName(spec.pant?.colors?.body)],
    ['Pant Reinforcement', colorName(spec.pant?.colors?.reinforcement)],
    ['Pant Drawcord', colorName(spec.pant?.colors?.drawcord)],
    ['Pant Stitching', colorName(spec.pant?.colors?.stitching)],
  ].filter(([, value]) => value);
  const sizes = [
    ['Kimono Size', spec.kimono?.size],
    ['Belt Size', spec.belt?.size],
    ['Pant Size', spec.pant?.size],
  ].filter(([, value]) => value);
  const belt = [
    ['Left Belt Text', spec.belt?.embroidery?.leftEnd || 'NO'],
    ['Left Belt Font', spec.belt?.embroidery?.leftFont || ''],
    [
      'Left Belt Thread',
      spec.belt?.embroidery?.leftThreadColorName ||
        spec.belt?.embroidery?.leftThreadColor ||
        '',
    ],
    ['Right Belt Text', spec.belt?.embroidery?.rightEnd || 'NO'],
    ['Right Belt Font', spec.belt?.embroidery?.rightFont || ''],
    [
      'Right Belt Thread',
      spec.belt?.embroidery?.rightThreadColorName ||
        spec.belt?.embroidery?.rightThreadColor ||
        '',
    ],
  ].filter(([, value]) => value);
  const logoRows = [
    [
      'Kimono Left Chest Logo',
      yesNoLink(kimonoImages['left-chest'], artwork['kimono:left-chest']),
    ],
    [
      'Kimono Left Sleeve Logo',
      yesNoLink(kimonoImages['left-sleeve'], artwork['kimono:left-sleeve']),
    ],
    [
      'Kimono Right Sleeve Logo',
      yesNoLink(kimonoImages['right-sleeve'], artwork['kimono:right-sleeve']),
    ],
    ['Kimono Back Logo', yesNoLink(kimonoImages.back, artwork['kimono:back'])],
    [
      'Pant Left Thigh Logo',
      yesNoLink(pantImages['left-pant'], artwork['pant:left-pant']),
    ],
    [
      'Pant Right Thigh Logo',
      yesNoLink(pantImages['right-pant'], artwork['pant:right-pant']),
    ],
  ];

  const renderRows = (rows, { htmlValues = false } = {}) =>
    rows
      .map(
        ([label, value]) =>
          `<tr><th>${esc(label)}</th><td>${htmlValues ? value : esc(value)}</td></tr>`,
      )
      .join('');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>DSPLN Tech Pack ${esc(record.id)}</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; color: #161616; background: #f7f7f7; }
      main { max-width: 1120px; margin: 0 auto; padding: 42px 28px 64px; }
      header { display: flex; justify-content: space-between; gap: 24px; align-items: end; padding-bottom: 18px; border-bottom: 2px solid #111; }
      h1 { margin: 0; font-size: 26px; letter-spacing: .18em; font-weight: 700; text-transform: uppercase; }
      .meta { color: #666; font-size: 12px; letter-spacing: .12em; text-transform: uppercase; text-align: right; }
      .layout { display: grid; grid-template-columns: minmax(240px, 360px) 1fr; gap: 32px; margin-top: 28px; }
      .preview, .card { background: #fff; border: 1px solid #d8d8d8; }
      .preview { padding: 24px; }
      .preview img { display: block; width: 100%; height: auto; object-fit: contain; }
      .card { margin-bottom: 18px; padding: 22px; break-inside: avoid; }
      h2 { margin: 0 0 16px; color: #730000; font-size: 14px; letter-spacing: .18em; text-transform: uppercase; }
      table { width: 100%; border-collapse: collapse; font-size: 13px; }
      th, td { padding: 9px 0; border-bottom: 1px solid #eee; vertical-align: top; text-align: left; }
      th { width: 46%; color: #777; letter-spacing: .08em; text-transform: uppercase; font-weight: 600; }
      td { color: #111; }
      a { color: #730000; }
      .note { margin-top: 20px; color: #666; font-size: 12px; line-height: 1.55; }
      @media print {
        body { background: #fff; }
        main { max-width: none; padding: 20px; }
        a { color: #111; text-decoration: none; }
      }
      @media (max-width: 760px) {
        header, .layout { display: block; }
        .meta { margin-top: 12px; text-align: left; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>DSPLN Tech Pack</h1>
          <div class="meta" style="text-align:left;margin-top:8px;">${esc(record.name || 'Custom Gi Design')}</div>
        </div>
        <div class="meta">
          Design ID<br>${esc(record.id)}<br><br>
          Updated<br>${esc(new Date(date).toLocaleString('en-US'))}
        </div>
      </header>
      <div class="layout">
        <aside class="preview">
          ${record.thumbnailUrl ? `<img src="${esc(record.thumbnailUrl)}" alt="Design preview">` : ''}
          <p class="note">Use the linked 3D design for rotation/editing. This page is the production reference for sizes, colors, belt text, and uploaded artwork.</p>
          <p><a href="${esc(linked.designUrl)}" target="_top">Open editable 3D design</a></p>
        </aside>
        <section>
          <div class="card">
            <h2>Sizes</h2>
            <table>${renderRows(sizes)}</table>
          </div>
          <div class="card">
            <h2>Colors</h2>
            <table>${renderRows(colors)}</table>
          </div>
          <div class="card">
            <h2>Belt Embroidery</h2>
            <table>${renderRows(belt)}</table>
          </div>
          <div class="card">
            <h2>Artwork</h2>
            <table>${renderRows(logoRows, { htmlValues: true })}</table>
          </div>
        </section>
      </div>
    </main>
  </body>
</html>`;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, {});

  try {
    connectLambda(event);
    const store = getStore(STORE_NAME);
    const query = event.queryStringParameters || {};

    if (event.httpMethod === 'GET' && query.id) {
      const record = await getRecordById(store, query.id);
      if (!record) return jsonResponse(404, { error: 'Design not found' });
      if (record.kind === 'artwork') {
        return jsonResponse(200, { data: { artwork: record } });
      }
      if (query.asset) return assetResponse(record, query.asset);
      if ((event.headers.accept || event.headers.Accept || '').includes('text/html')) {
        if (query.view === 'tech-pack') {
          return redirectResponse(
            absoluteAppUrl(event, '/tech-pack/gi', { id: record.id }),
          );
        }
        return htmlResponse(200, productionPacketHtml(event, record));
      }
      return jsonResponse(200, { data: { design: withLinks(event, record) } });
    }

    if (event.httpMethod === 'GET') {
      // Standalone artwork only (Artwork Studio listing).
      if (query.artwork === '1') {
        if (!query.ownerKey) return jsonResponse(400, { error: 'ownerKey is required' });
        const artworkRecords = await listArtworkRecords(store, query.ownerKey);
        return jsonResponse(200, {
          data: {
            artwork: artworkRecords.sort((a, b) =>
              String(b.updatedAt).localeCompare(String(a.updatedAt)),
            ),
          },
        });
      }

      // The Locker's Uploads page: design-embedded logos AND standalone
      // artwork, merged on a stable per-image key so the same hosted PNG never
      // shows up twice.
      if (query.logos === '1') {
        const [logoRecords, artworkRecords] = await Promise.all([
          listLogoRecords(store, query),
          listArtworkRecords(store, query.ownerKey),
        ]);
        return jsonResponse(200, {
          data: {
            logos: mergeUploadEntries([
              ...artworkRecords.map((record) => uploadEntryForArtwork(record)),
              ...logoRecords
                .filter(Boolean)
                .flatMap((record) => logoEntriesForRecord(event, record)),
            ]),
          },
        });
      }

      // Studio summary: paginated, lightweight listing of every design.
      // Loads only one page of records at a time — the full all=1 listing
      // runs the function out of memory on real data.
      if (query.summary === '1') {
        if (!adminKeyOk(event)) return jsonResponse(403, { error: 'Admin key required' });
        const limit = Math.min(60, Math.max(1, Number(query.limit) || 24));
        const offset = Math.max(0, Number(query.offset) || 0);
        const studioOnly = query.studio === '1';
        let pageKeys;
        let totalKeys;
        if (studioOnly) {
          // Page over the studio index so studio designs are never hidden
          // behind pages of customer records.
          const indexKeys = [];
          let cursor;
          do {
            const page = await store.list({ prefix: 'studio-index/', cursor });
            indexKeys.push(...page.blobs.map((blob) => blob.key));
            cursor = page.cursor;
          } while (cursor);
          indexKeys.sort().reverse();
          totalKeys = indexKeys.length;
          const pointers = await Promise.all(
            indexKeys
              .slice(offset, offset + limit)
              .map((key) => store.get(key, { type: 'json' }).catch(() => null)),
          );
          pageKeys = pointers.filter((p) => p?.key).map((p) => p.key);
        } else {
          const keys = [];
          let cursor;
          do {
            const page = await store.list({ prefix: 'designs/', cursor });
            keys.push(...page.blobs.map((blob) => blob.key));
            cursor = page.cursor;
          } while (cursor);
          keys.sort().reverse();
          totalKeys = keys.length;
          pageKeys = keys.slice(offset, offset + limit);
        }
        const records = await Promise.all(
          pageKeys.map((key) => store.get(key, { type: 'json' }).catch(() => null)),
        );
        const designs = records.filter(Boolean).map((record) => {
          const linked = withLinks(event, record);
          const thumbnailUrl =
            typeof record.thumbnailUrl === 'string' &&
            record.thumbnailUrl.startsWith('data:') &&
            record.thumbnailUrl.length > 200000
              ? null
              : record.thumbnailUrl ?? null;
          return {
            id: record.id,
            name: record.name ?? null,
            productHandle: record.productHandle ?? null,
            ownerKey: record.ownerKey ?? null,
            customerEmail: record.customerEmail ?? null,
            orderName: record.orderName ?? null,
            source: record.configData?.source ?? null,
            studio: record.configData?.studio === true,
            thumbnailUrl,
            createdAt: record.createdAt ?? null,
            updatedAt: record.updatedAt ?? null,
            designUrl: linked.designUrl,
            artwork: linked.artwork,
          };
        });
        // Sorted newest-first by key only approximates recency; the client
        // re-sorts the page by updatedAt.
        return jsonResponse(200, {
          data: {
            designs,
            total: totalKeys,
            nextOffset: offset + limit < totalKeys ? offset + limit : null,
          },
        });
      }

      // DSPLN-side identity: which Shopify customer does this email belong
      // to, according to DSPLN's OWN records? Orders stamp the email onto
      // claimed designs, so after a purchase the answer lives here — the
      // admin no longer needs Shopify's customers API to find someone's
      // Locker. Admin-gated: email->identity mapping is not public data.
      if (query.resolveCustomer === '1') {
        if (!adminKeyOk(event)) return jsonResponse(403, { error: 'Admin key required' });
        const email = String(query.customerEmail || '').trim().toLowerCase();
        if (!email) return jsonResponse(400, { error: 'customerEmail is required' });

        // One read; claims write this index. The full scan below is only a
        // self-healing fallback for records claimed before the index existed,
        // and it rewrites the index so the slow path runs at most once.
        const indexed = await store.get(emailIndexKey(email), { type: 'json' });
        if (indexed?.customerId) {
          return jsonResponse(200, {
            data: {
              customerId: String(indexed.customerId),
              ownerKey: indexed.ownerKey ?? null,
              designCount: null,
            },
          });
        }

        const records = (await listRecords(store, 'designs/')).filter(
          (record) =>
            String(record?.customerEmail || '').trim().toLowerCase() === email &&
            record?.shopifyCustomerId,
        );
        records.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
        const match = records[0] ?? null;
        if (match) {
          await writeEmailIndex(store, email, {
            customerId: match.shopifyCustomerId,
            ownerKey: match.ownerKey,
          });
        }
        return jsonResponse(200, {
          data: {
            customerId: match?.shopifyCustomerId ?? null,
            ownerKey: match?.ownerKey ?? null,
            designCount: records.length,
          },
        });
      }

      if (query.all === '1') {
        if (!adminKeyOk(event)) return jsonResponse(403, { error: 'Admin key required' });
        const designs = await listRecords(store, 'designs/');
        return jsonResponse(200, {
          data: {
            designs: designs
              .map((record) => withLinks(event, record))
              .sort((a, b) =>
                String(b.updatedAt).localeCompare(String(a.updatedAt)),
              ),
          },
        });
      }

      const ownerKey = query.ownerKey;
      if (!ownerKey) return jsonResponse(400, { error: 'ownerKey is required' });

      const ownerPrefix = `designs/${cleanPathPart(ownerKey)}/`;
      const prefix = query.productHandle
        ? `${ownerPrefix}${cleanPathPart(query.productHandle)}/`
        : ownerPrefix;
      const designs = await listRecords(store, prefix);

      return jsonResponse(200, {
        data: {
          designs: designs
            .filter(Boolean)
            .map((record) => withLinks(event, record))
            .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
        },
      });
    }

    if (event.httpMethod === 'POST') {
      const payload = safeParse(event.body);
      if (!payload.ownerKey) {
        return jsonResponse(400, { error: 'ownerKey is required' });
      }

      // Claim guest work: move everything stored under `guest:{token}` into
      // this ownerKey. Only a signed-in (shopify:) owner can be the target —
      // claiming into another guest key would just shuffle anonymous records.
      if (payload.action === 'claim-guest') {
        if (!shopifyCustomerIdFromOwnerKey(payload.ownerKey)) {
          return jsonResponse(400, { error: 'A signed-in ownerKey is required' });
        }
        const tokens = cleanGuestTokens(payload.guestTokens);
        const claimed = tokens.length
          ? await claimGuestRecords(store, payload.ownerKey, tokens)
          : { designs: 0, artwork: 0, failed: 0, tokens: 0 };
        return jsonResponse(200, { data: { claimed } });
      }

      // Artwork Studio save: hosted URL + metadata only, no image bytes.
      if (payload.kind === 'artwork') {
        if (!isAllowedArtworkUrl(payload.url, event)) {
          return jsonResponse(400, { error: 'Invalid artwork url' });
        }
        if (payload.parentId && !/^art_[a-z0-9-]+$/i.test(String(payload.parentId))) {
          return jsonResponse(400, { error: 'Invalid parentId' });
        }

        const savedAt = new Date().toISOString();
        const artworkId = `art_${randomUUID()}`;
        const filename = cleanText(payload.filename, 160) || 'artwork.png';
        const artwork = {
          kind: 'artwork',
          id: artworkId,
          ownerKey: payload.ownerKey,
          url: String(payload.url),
          filename,
          title: cleanText(payload.title, 160) || filename,
          width: cleanDimension(payload.width),
          height: cleanDimension(payload.height),
          parentId: payload.parentId ? String(payload.parentId) : null,
          revisionType: REVISION_TYPES.includes(payload.revisionType)
            ? payload.revisionType
            : 'upload',
          createdAt: savedAt,
          updatedAt: savedAt,
        };

        const key = artworkKey(artwork);
        await store.setJSON(key, artwork);
        await store.setJSON(lookupKey(artworkId), { key });

        return jsonResponse(200, { data: { artwork } });
      }

      const now = new Date().toISOString();
      const id = payload.id || `gi_${randomUUID()}`;
      let record = {
        id,
        ownerKey: payload.ownerKey,
        shopDomain: payload.shopDomain || null,
        shopifyCustomerId: payload.shopifyCustomerId || null,
        customerEmail: payload.customerEmail || null,
        guestToken: payload.guestToken || null,
        productId: payload.productId || null,
        productHandle: normalizeShopifyProductHandle(payload.productHandle),
        name: payload.name || 'Saved Gi Design',
        configData: payload.configData,
        thumbnailUrl: payload.thumbnailUrl || null,
        createdAt: payload.createdAt || now,
        updatedAt: now,
      };

      record = await enrichArtworkLinks(record);

      const key = designKey(record);
      await store.setJSON(key, record);
      await store.setJSON(lookupKey(id), { key });
      if (record.configData?.studio === true) {
        await store.setJSON(studioIndexKey(id), { key });
      }

      return jsonResponse(200, { data: { design: withLinks(event, record) } });
    }

    if (event.httpMethod === 'DELETE') {
      const id = query.id;
      const record = id ? await getRecordById(store, id) : null;
      if (!record) return jsonResponse(404, { error: 'Design not found' });
      if (query.ownerKey && query.ownerKey !== record.ownerKey) {
        return jsonResponse(403, { error: 'Design owner mismatch' });
      }
      // Artwork records are customer-owned: proof of ownership is required,
      // not optional as it still is for the legacy design delete path.
      if (record.kind === 'artwork' && query.ownerKey !== record.ownerKey) {
        return jsonResponse(403, { error: 'Artwork owner mismatch' });
      }
      const lookup = await store.get(lookupKey(id), { type: 'json' });
      if (lookup?.key) await store.delete(lookup.key);
      await store.delete(lookupKey(id));
      await store.delete(studioIndexKey(id)).catch(() => {});
      return jsonResponse(200, { data: { deleted: true } });
    }

    return jsonResponse(405, { error: 'Method not allowed' });
  } catch (error) {
    console.error('[customer-designs]', error);
    return jsonResponse(500, { error: 'Customer designs failed' });
  }
};
