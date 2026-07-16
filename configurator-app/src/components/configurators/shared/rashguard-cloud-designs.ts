import { storefrontOrigin } from './storefront-links';
import { shrinkArtworkDataUrl, uploadArtworkImage } from './preview-upload';

type RashguardProductConfig = {
  shopifyProductHandle: string;
  shopifyProductPath: string;
  netlifyPath: string;
  localStorageKey: string;
};

interface CustomerDesignRecord {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  configData: unknown;
  createdAt: string;
  updatedAt: string;
  designUrl?: string;
  productionUrl?: string;
}

interface DesignResponse {
  data: {
    design: CustomerDesignRecord;
  };
}

export interface RashguardCloudOwnerContext {
  ownerKey: string;
  shopDomain: string | null;
  shopifyCustomerId: string | null;
  customerEmail: string | null;
  guestToken: string | null;
  productId: string | null;
  productHandle: string;
  isCustomer: boolean;
}

export interface RashguardCloudDesignRecordResult {
  draft: RashguardCloudDraftDocument;
  designUrl?: string;
  productionUrl?: string;
}

export interface RashguardCloudDraftDocument {
  id: string;
  name: string;
  spec: unknown;
  images: unknown[];
  renders?: {
    front?: string;
    back?: string;
    left?: string;
    right?: string;
    aspect?: number;
  };
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
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

function sourceForProduct(config: RashguardProductConfig) {
  return config.netlifyPath.replace(/^\/configurator\//, '');
}

function getOrCreateGuestToken(config: RashguardProductConfig) {
  if (typeof window === 'undefined') return null;

  const key = `${config.localStorageKey}:cloud-guest`;
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const token =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(key, token);
  return token;
}

function cleanParam(value: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getRashguardCloudOwnerContext(
  config: RashguardProductConfig,
): RashguardCloudOwnerContext | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const shopDomain = cleanParam(params.get('shop'));
  const shopifyCustomerId = cleanParam(params.get('customerId'));
  const customerEmail = cleanParam(params.get('customerEmail'));
  const productId = cleanParam(params.get('productId'));
  const productHandle =
    cleanParam(params.get('productHandle')) ?? config.shopifyProductHandle;
  const guestToken = shopifyCustomerId ? null : getOrCreateGuestToken(config);
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

function makeApiUrl(path: string) {
  const base = apiBaseUrl();
  if (!base) throw new Error('API URL is not configured.');
  return new URL(`${base}/api${path}`);
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

/**
 * Keep raw artwork bytes OUT of the design-save JSON. Drafts embed each image
 * layer as a full-resolution data URL (the original upload can be 20MB+),
 * which blows past Netlify's ~6MB function body limit and makes the save fail
 * — leaving orders without working Tech Pack / 3D Design links. Mirror the gi
 * flow: upload each layer to hosted storage and store the URL; if the upload
 * fails, fall back to a print-ceiling shrunk data URL that stays within budget.
 */
async function offloadDraftImages(images: unknown[]): Promise<unknown[]> {
  return Promise.all(
    images.map(async (image) => {
      if (!image || typeof image !== 'object') return image;
      const record = image as { dataUrl?: unknown };
      const dataUrl = record.dataUrl;
      if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
        return image;
      }
      const slim = await shrinkArtworkDataUrl(dataUrl);
      const hosted = await uploadArtworkImage(slim);
      return { ...record, dataUrl: hosted ?? slim };
    }),
  );
}

export async function saveRashguardCloudDesignRecord(
  draft: RashguardCloudDraftDocument,
  context: RashguardCloudOwnerContext | null,
  config: RashguardProductConfig,
): Promise<RashguardCloudDesignRecordResult | null> {
  if (!context || !apiBaseUrl()) return null;

  const images = await offloadDraftImages(draft.images);
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
      configData: {
        source: sourceForProduct(config),
        version: 1,
        spec: draft.spec,
        images,
        renders: draft.renders,
      },
      thumbnailUrl: draft.thumbnailUrl ?? null,
      createdAt: draft.createdAt,
    }),
  });

  return {
    draft: {
      ...draft,
      id: response.data.design.id,
      name: response.data.design.name,
      thumbnailUrl: response.data.design.thumbnailUrl ?? undefined,
      createdAt: response.data.design.createdAt,
      updatedAt: response.data.design.updatedAt,
    },
    designUrl: response.data.design.designUrl,
    productionUrl: response.data.design.productionUrl,
  };
}

export function buildRashguardCloudDesignUrls(
  id: string,
  config: RashguardProductConfig,
) {
  const base = apiBaseUrl();
  if (!base) return null;
  const designUrl = new URL(config.shopifyProductPath, storefrontOrigin());
  designUrl.searchParams.set('design', id);

  return {
    designUrl: designUrl.toString(),
    productionUrl: `${base}/api/customer-designs?id=${encodeURIComponent(id)}`,
  };
}
