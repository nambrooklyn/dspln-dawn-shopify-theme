import type { GiSerializedState, KimonoLogo } from './gi-state';
import type { KimonoLogoSlot, PantLogoSlot } from './gi-config';
import { GI_PRODUCT_CONFIGS } from '../shared/gi-product-config';

const PRODUCT_CONFIG = GI_PRODUCT_CONFIGS.kids;
const DB_NAME = PRODUCT_CONFIG.localDraftDbName;
const DB_VERSION = 1;
const DESIGN_STORE = 'designs';
const FALLBACK_STORAGE_KEY = PRODUCT_CONFIG.fallbackStorageKey;

export const AUTO_GI_DRAFT_ID = 'auto';

export interface GiDraftLogoImage {
  blob: Blob;
  filename: string;
  imageWidth: number;
  imageHeight: number;
}

export interface GiDraftDocument {
  id: string;
  name: string;
  spec: GiSerializedState;
  thumbnailUrl?: string;
  renders?: Partial<
    Record<
      'front' | 'back' | 'left' | 'right' | 'leftBeltEnd' | 'rightBeltEnd',
      string
    >
  >;
  createdAt: string;
  updatedAt: string;
  images: {
    kimono: Partial<Record<KimonoLogoSlot, GiDraftLogoImage>>;
    pant: Partial<Record<PantLogoSlot, GiDraftLogoImage>>;
  };
}

type DraftLogoMap<TSlot extends string> = Partial<
  Record<TSlot, GiDraftLogoImage>
>;

function isBrowserStorageAvailable() {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function stripImagesForFallback(draft: GiDraftDocument): GiDraftDocument {
  return {
    ...draft,
    images: {
      kimono: {},
      pant: {},
    },
  };
}

function readFallbackDesigns() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FALLBACK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GiDraftDocument[]) : [];
  } catch {
    return [];
  }
}

function writeFallbackDesigns(designs: GiDraftDocument[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(designs));
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openDraftDb() {
  if (!isBrowserStorageAvailable()) {
    return Promise.reject(new Error('IndexedDB is not available.'));
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DESIGN_STORE)) {
        db.createObjectStore(DESIGN_STORE, { keyPath: 'id' });
      }
    };
  });
}

async function withDesignStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await openDraftDb();
  try {
    const transaction = db.transaction(DESIGN_STORE, mode);
    const request = fn(transaction.objectStore(DESIGN_STORE));
    const result = await requestToPromise(request);
    await transactionDone(transaction);
    return result;
  } finally {
    db.close();
  }
}

async function logoToDraftImage(logo: KimonoLogo) {
  let blob: Blob;
  if (logo.file) {
    blob = logo.file;
  } else {
    const response = await fetch(logo.imageUrl);
    blob = await response.blob();
  }
  return {
    blob,
    filename: logo.filename,
    imageWidth: logo.imageWidth,
    imageHeight: logo.imageHeight,
  };
}

async function logosToDraftImages<TSlot extends string>(
  logos: Partial<Record<TSlot, KimonoLogo>>,
) {
  const entries = await Promise.all(
    Object.entries(logos).map(async ([slot, logo]) => {
      if (!logo) return null;
      try {
        return [slot, await logoToDraftImage(logo as KimonoLogo)] as const;
      } catch {
        return null;
      }
    }),
  );

  return entries.reduce<DraftLogoMap<TSlot>>((acc, entry) => {
    if (!entry) return acc;
    const [slot, image] = entry;
    acc[slot as TSlot] = image;
    return acc;
  }, {});
}

export async function createGiDraftDocument({
  id,
  name,
  spec,
  kimonoLogos,
  pantLogos,
  thumbnailUrl,
  renders,
  existingCreatedAt,
}: {
  id: string;
  name: string;
  spec: GiSerializedState;
  kimonoLogos: Partial<Record<KimonoLogoSlot, KimonoLogo>>;
  pantLogos: Partial<Record<PantLogoSlot, KimonoLogo>>;
  thumbnailUrl?: string;
  renders?: GiDraftDocument['renders'];
  existingCreatedAt?: string;
}): Promise<GiDraftDocument> {
  const now = new Date().toISOString();
  return {
    id,
    name,
    spec,
    thumbnailUrl,
    renders,
    createdAt: existingCreatedAt ?? now,
    updatedAt: now,
    images: {
      kimono: await logosToDraftImages(kimonoLogos),
      pant: await logosToDraftImages(pantLogos),
    },
  };
}

export async function saveGiDraftDocument(draft: GiDraftDocument) {
  if (!isBrowserStorageAvailable()) {
    const safeDraft = stripImagesForFallback(draft);
    const next = [
      safeDraft,
      ...readFallbackDesigns().filter((design) => design.id !== draft.id),
    ];
    writeFallbackDesigns(next);
    return;
  }

  await withDesignStore('readwrite', (store) => store.put(draft));
}

export async function readGiDraftDocument(id: string) {
  if (!isBrowserStorageAvailable()) {
    return readFallbackDesigns().find((design) => design.id === id);
  }

  return withDesignStore<GiDraftDocument | undefined>('readonly', (store) =>
    store.get(id),
  ).catch(() => undefined);
}

export async function deleteGiDraftDocument(id: string) {
  if (!isBrowserStorageAvailable()) {
    writeFallbackDesigns(
      readFallbackDesigns().filter((design) => design.id !== id),
    );
    return;
  }

  await withDesignStore('readwrite', (store) => store.delete(id));
}

export async function listSavedGiDesigns() {
  if (!isBrowserStorageAvailable()) {
    return readFallbackDesigns()
      .filter((design) => design.id !== AUTO_GI_DRAFT_ID)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  const designs = await withDesignStore<GiDraftDocument[]>(
    'readonly',
    (store) => store.getAll(),
  ).catch((): GiDraftDocument[] => []);

  return designs
    .filter((design) => design.id !== AUTO_GI_DRAFT_ID)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function logoImageToKimonoLogo(image: GiDraftLogoImage): KimonoLogo {
  return {
    imageUrl: URL.createObjectURL(image.blob),
    filename: image.filename,
    imageWidth: image.imageWidth,
    imageHeight: image.imageHeight,
  };
}

function createLogoObjectUrlMap<TSlot extends string>(
  images: Partial<Record<TSlot, GiDraftLogoImage>>,
) {
  return Object.entries(images).reduce<Partial<Record<TSlot, KimonoLogo>>>(
    (acc, [slot, image]) => {
      if (!image) return acc;
      acc[slot as TSlot] = logoImageToKimonoLogo(image as GiDraftLogoImage);
      return acc;
    },
    {},
  );
}

export function createDraftLogoObjectUrls(draft: GiDraftDocument) {
  return {
    kimono: createLogoObjectUrlMap(draft.images.kimono),
    pant: createLogoObjectUrlMap(draft.images.pant),
  };
}
