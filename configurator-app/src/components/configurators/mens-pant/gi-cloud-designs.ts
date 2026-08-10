import type { KimonoLogo } from './gi-state';
import { isStudioMode } from '../shared/studio-mode';
import type { GiDraftDocument, GiDraftLogoImage } from './gi-draft-storage';
import type { KimonoLogoSlot, PantLogoSlot } from './gi-config';
import { currentGiProductConfig } from '../shared/gi-product-config';
import { uploadArtworkImageCached } from '../shared/preview-upload';
import { storefrontOrigin } from '../shared/storefront-links';

const PRODUCT_CONFIG = currentGiProductConfig();
const GUEST_TOKEN_STORAGE_KEY = PRODUCT_CONFIG.guestTokenStorageKey;
const PRODUCT_HANDLE = PRODUCT_CONFIG.shopifyProductHandle;

type CloudLogoImage = Omit<GiDraftLogoImage, 'blob'> & {
  // Lightweight by default: logos are uploaded separately and referenced by
  // `shopifyUrl`. `dataUrl` (base64) is only present as a fallback when the
  // upload failed, so the logo still survives in the record.
  dataUrl?: string;
  shopifyUrl?: string;
};

interface CloudDesignConfigData {
  source: string;
  studio?: boolean;
  version: 1;
  spec: GiDraftDocument['spec'];
  renders?: GiDraftDocument['renders'];
  images: {
    kimono: Partial<Record<KimonoLogoSlot, CloudLogoImage>>;
    pant: Partial<Record<PantLogoSlot, CloudLogoImage>>;
  };
}

interface CustomerDesignRecord {
  id: string;
  name: string;
  configData: CloudDesignConfigData;
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
  designUrl?: string;
  netlifyDesignUrl?: string;
  productionUrl?: string;
  artwork?: CloudArtworkLink[];
}

interface ListDesignsResponse {
  data: {
    designs: CustomerDesignRecord[];
  };
}

interface DesignResponse {
  data: {
    design: CustomerDesignRecord;
  };
}

export interface CloudArtworkLink {
  part: 'kimono' | 'pant';
  slot: string;
  filename: string;
  url: string;
}

export interface GiCloudDesignRecordResult {
  draft: GiDraftDocument;
  designUrl?: string;
  netlifyDesignUrl?: string;
  productionUrl?: string;
  artwork: CloudArtworkLink[];
}

export interface GiCloudOwnerContext {
  ownerKey: string;
  shopDomain: string | null;
  shopifyCustomerId: string | null;
  customerEmail: string | null;
  guestToken: string | null;
  productId: string | null;
  productHandle: string;
  isCustomer: boolean;
}

function apiBaseUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL as string;
  }

  if (typeof window !== 'undefined') {
    return window.location.origin;
  }

  return undefined;
}

function getOrCreateGuestToken() {
  if (typeof window === 'undefined') return null;

  const existing = window.localStorage.getItem(GUEST_TOKEN_STORAGE_KEY);
  if (existing) return existing;

  const token =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(GUEST_TOKEN_STORAGE_KEY, token);
  return token;
}

function cleanParam(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getGiCloudOwnerContext(): GiCloudOwnerContext | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const shopDomain = cleanParam(params.get('shop'));
  const shopifyCustomerId = cleanParam(params.get('customerId'));
  const customerEmail = cleanParam(params.get('customerEmail'));
  const productId = cleanParam(params.get('productId'));
  const productHandle = cleanParam(params.get('productHandle')) ?? PRODUCT_HANDLE;
  const guestToken = shopifyCustomerId ? null : getOrCreateGuestToken();
  const ownerKey = shopifyCustomerId
    ? `shopify:${shopDomain ?? 'dspln'}:${shopifyCustomerId}`
    : guestToken
      ? `guest:${guestToken}`
      : null;

  if (!ownerKey) return null;

  return {
    ownerKey,
    shopDomain,
    shopifyCustomerId,
    customerEmail,
    guestToken,
    productId,
    productHandle,
    isCustomer: Boolean(shopifyCustomerId),
  };
}

async function imageToDataUrl(image: GiDraftLogoImage) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(image.blob);
  });
}

async function dataUrlToBlob(dataUrl: string) {
  return fetch(dataUrl).then((response) => response.blob());
}

async function imagesToCloudImages<TSlot extends string>(
  images: Partial<Record<TSlot, GiDraftLogoImage>>,
) {
	const entries = await Promise.all(
	    Object.entries(images).map(async ([slot, image]) => {
	      if (!image) return null;
	      const draftImage = image as GiDraftLogoImage;
	      // Upload the logo separately and store only its URL. This keeps the
	      // heavy base64 out of the design-record JSON so the save can't fail
	      // on logo-heavy designs. The upload is content-cached, so a logo the
	      // customer already uploaded (earlier save, earlier add-to-cart) is
	      // not shrunk or uploaded again. If the upload fails, fall back to
	      // embedding the shrunk base64 so the logo is never silently lost.
	      const { url: uploadedUrl, shrunkDataUrl } =
	        await uploadArtworkImageCached(await imageToDataUrl(draftImage));
	      const stored: CloudLogoImage = uploadedUrl
	        ? {
	            shopifyUrl: uploadedUrl,
	            filename: draftImage.filename,
	            imageWidth: draftImage.imageWidth,
	            imageHeight: draftImage.imageHeight,
	          }
	        : {
	            dataUrl: shrunkDataUrl,
	            filename: draftImage.filename,
	            imageWidth: draftImage.imageWidth,
	            imageHeight: draftImage.imageHeight,
	          };
	      return [slot, stored] as const;
	    }),
  );

  return entries.reduce<Partial<Record<TSlot, CloudLogoImage>>>(
    (acc, entry) => {
      if (!entry) return acc;
      const [slot, image] = entry;
      acc[slot as TSlot] = image;
      return acc;
    },
    {},
  );
}

async function cloudImageToDraftImage(
  image: CloudLogoImage,
): Promise<GiDraftLogoImage> {
  // Prefer the hosted URL; fall back to the embedded base64 for older records.
  const source = image.shopifyUrl ?? image.dataUrl;
  return {
    blob: source ? await dataUrlToBlob(source) : new Blob(),
    filename: image.filename,
    imageWidth: image.imageWidth,
    imageHeight: image.imageHeight,
  };
}

async function cloudImagesToDraftImages<TSlot extends string>(
  images: Partial<Record<TSlot, CloudLogoImage>> | undefined,
) {
  const entries = await Promise.all(
    Object.entries(images ?? {}).map(async ([slot, image]) => {
      if (!image) return null;
      return [slot, await cloudImageToDraftImage(image as CloudLogoImage)] as const;
    }),
  );

  return entries.reduce<Partial<Record<TSlot, GiDraftLogoImage>>>(
    (acc, entry) => {
      if (!entry) return acc;
      const [slot, image] = entry;
      acc[slot as TSlot] = image;
      return acc;
    },
    {},
  );
}

async function draftToCloudConfigData(
  draft: GiDraftDocument,
): Promise<CloudDesignConfigData> {
  // Kimono and pant logo uploads are independent — run them concurrently so
  // add-to-cart waits for the slowest part, not the sum of both.
  const [kimono, pant] = await Promise.all([
    imagesToCloudImages(draft.images.kimono),
    imagesToCloudImages(draft.images.pant),
  ]);
  return {
    source: PRODUCT_CONFIG.cloudConfigSource,
    studio: isStudioMode() || undefined,
    version: 1,
    spec: draft.spec,
    renders: draft.renders,
    images: { kimono, pant },
  };
}

/**
 * Fold the server's response into the draft we just uploaded WITHOUT
 * re-downloading the artwork. recordToDraft fetches every logo back from the
 * blob store — multi-MB round-trips for bytes that are already in memory —
 * and on the save/add-to-cart path the local blobs are byte-identical to what
 * was stored. Only the server-owned fields change.
 */
function mergeSavedRecordIntoDraft(
  draft: GiDraftDocument,
  record: CustomerDesignRecord,
): GiDraftDocument {
  return {
    ...draft,
    id: record.id,
    name: record.name,
    thumbnailUrl: record.thumbnailUrl ?? draft.thumbnailUrl,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function recordToDraft(record: CustomerDesignRecord) {
  const config = record.configData;
  return {
    id: record.id,
    name: record.name,
    spec: config.spec,
    thumbnailUrl: record.thumbnailUrl ?? undefined,
    renders: config.renders,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    images: {
      kimono: await cloudImagesToDraftImages(config.images?.kimono),
      pant: await cloudImagesToDraftImages(config.images?.pant),
    },
  } satisfies GiDraftDocument;
}

function makeApiUrl(path: string, params?: Record<string, string | null>) {
  const base = apiBaseUrl();
  if (!base) throw new Error('API URL is not configured.');

  const url = new URL(`${base}/api${path}`);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return url;
}

async function requestJson<T>(url: URL, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

export async function listGiCloudDesigns(context: GiCloudOwnerContext | null) {
  if (!context || !apiBaseUrl()) return [];

  const url = makeApiUrl('/customer-designs', {
    ownerKey: context.ownerKey,
    productHandle: context.productHandle,
  });
  const response = await requestJson<ListDesignsResponse>(url);
  return Promise.all(response.data.designs.map(recordToDraft));
}

export async function saveGiCloudDesign(
  draft: GiDraftDocument,
  context: GiCloudOwnerContext | null,
) {
  if (!context || !apiBaseUrl()) return null;

  const url = makeApiUrl('/customer-designs');
  const response = await requestJson<DesignResponse>(url, {
    method: 'POST',
    body: JSON.stringify({
      ownerKey: context.ownerKey,
      shopDomain: context.shopDomain,
      shopifyCustomerId: context.shopifyCustomerId,
      customerEmail: context.customerEmail,
      guestToken: context.guestToken,
      productId: context.productId,
      productHandle: context.productHandle,
      id: draft.id,
      name: draft.name,
      configData: await draftToCloudConfigData(draft),
      thumbnailUrl: draft.thumbnailUrl ?? null,
      createdAt: draft.createdAt,
    }),
  });

  return mergeSavedRecordIntoDraft(draft, response.data.design);
}

export async function saveGiCloudDesignRecord(
  draft: GiDraftDocument,
  context: GiCloudOwnerContext | null,
): Promise<GiCloudDesignRecordResult | null> {
  if (!context || !apiBaseUrl()) return null;

  const url = makeApiUrl('/customer-designs');
  const response = await requestJson<DesignResponse>(url, {
    method: 'POST',
    body: JSON.stringify({
      ownerKey: context.ownerKey,
      shopDomain: context.shopDomain,
      shopifyCustomerId: context.shopifyCustomerId,
      customerEmail: context.customerEmail,
      guestToken: context.guestToken,
      productId: context.productId,
      productHandle: context.productHandle,
      id: draft.id,
      name: draft.name,
      configData: await draftToCloudConfigData(draft),
      thumbnailUrl: draft.thumbnailUrl ?? null,
      createdAt: draft.createdAt,
    }),
  });

  return {
    draft: mergeSavedRecordIntoDraft(draft, response.data.design),
    designUrl: response.data.design.designUrl,
    productionUrl: response.data.design.productionUrl,
    artwork: response.data.design.artwork ?? [],
  };
}

export async function getGiCloudDesign(id: string) {
  if (!apiBaseUrl()) return null;

  const url = makeApiUrl('/customer-designs', { id });
  const response = await requestJson<DesignResponse>(url);
  return recordToDraft(response.data.design);
}


/**
 * Fetch a saved design together with the owner context it was stored under.
 * Admin edits (portal "Open 3D design") reuse this so a save overwrites the
 * customer's original record instead of minting a fresh guest copy.
 */
export async function getGiCloudDesignForAdmin(id: string): Promise<{
  draft: GiDraftDocument;
  owner: GiCloudOwnerContext | null;
} | null> {
  if (!apiBaseUrl()) return null;

  const url = makeApiUrl('/customer-designs', { id });
  const response = await requestJson<DesignResponse>(url);
  const record = response.data.design as (typeof response.data.design) & {
    ownerKey?: string;
    shopDomain?: string | null;
    shopifyCustomerId?: string | null;
    customerEmail?: string | null;
    productId?: string | null;
    productHandle?: string;
  };
  const owner: GiCloudOwnerContext | null = record.ownerKey
    ? {
        ownerKey: record.ownerKey,
        shopDomain: record.shopDomain ?? null,
        shopifyCustomerId: record.shopifyCustomerId ?? null,
        customerEmail: record.customerEmail ?? null,
        guestToken: null,
        productId: record.productId ?? null,
        productHandle: record.productHandle ?? PRODUCT_HANDLE,
        isCustomer: Boolean(record.shopifyCustomerId),
      }
    : null;
  return { draft: await recordToDraft(record), owner };
}

export function buildGiCloudDesignUrls(id: string) {
  const base = apiBaseUrl();
  if (!base) return null;
  const designUrl = new URL(PRODUCT_CONFIG.shopifyProductPath, storefrontOrigin());
  designUrl.searchParams.set('design', id);

  return {
    designUrl: designUrl.toString(),
    netlifyDesignUrl: `${base}${PRODUCT_CONFIG.netlifyPath}?design=${encodeURIComponent(id)}`,
    productionUrl: `${base}/api/customer-designs?id=${encodeURIComponent(id)}`,
  };
}

export async function deleteGiCloudDesign(
  id: string,
  context: GiCloudOwnerContext | null,
) {
  if (!context || !apiBaseUrl()) return;

  const url = makeApiUrl('/customer-designs', {
    id,
    ownerKey: context.ownerKey,
  });
  await requestJson(url, { method: 'DELETE' });
}

export function logoImageToKimonoLogo(image: GiDraftLogoImage): KimonoLogo {
  return {
    imageUrl: URL.createObjectURL(image.blob),
    filename: image.filename,
    imageWidth: image.imageWidth,
    imageHeight: image.imageHeight,
  };
}
