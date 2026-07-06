import { RASHGUARD_PRODUCT_CONFIG } from './rashguard-config';
import type {
  RashguardArtworkLayer,
  RashguardSerializedState,
} from './rashguard-state';

export const AUTO_RASHGUARD_DRAFT_ID = 'rashguard_auto_draft';

export interface RashguardDraftArtworkImage {
  id: string;
  kind?: RashguardArtworkLayer['kind'];
  dataUrl?: string;
  filename: string;
  imageWidth: number;
  imageHeight: number;
  text?: string;
  fontFamily?: string;
  color?: string;
  outlineColor?: string;
  outlineWidth?: number;
  target: RashguardArtworkLayer['target'];
  x: number;
  y: number;
  scale: number;
  rotationDeg: number;
  visible: boolean;
  locked?: boolean;
}

export interface RashguardDraftDocument {
  id: string;
  name: string;
  spec: RashguardSerializedState;
  images: RashguardDraftArtworkImage[];
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
}

function readAllDrafts(): RashguardDraftDocument[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(
      RASHGUARD_PRODUCT_CONFIG.localStorageKey,
    );
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAllDrafts(drafts: RashguardDraftDocument[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    RASHGUARD_PRODUCT_CONFIG.localStorageKey,
    JSON.stringify(drafts),
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function imageUrlToDataUrl(url: string) {
  if (url.startsWith('data:')) return url;
  const response = await fetch(url);
  const blob = await response.blob();
  return fileToDataUrl(new File([blob], 'artwork.png', { type: blob.type }));
}

async function artworkLayerToDraftImage(
  layer: RashguardArtworkLayer,
): Promise<RashguardDraftArtworkImage> {
  return {
    id: layer.id,
    kind: layer.kind,
    dataUrl:
      layer.kind === 'image' && layer.imageUrl
        ? layer.file
          ? await fileToDataUrl(layer.file)
          : await imageUrlToDataUrl(layer.imageUrl)
        : undefined,
    filename: layer.filename,
    imageWidth: layer.imageWidth,
    imageHeight: layer.imageHeight,
    text: layer.text,
    fontFamily: layer.fontFamily,
    color: layer.color,
    outlineColor: layer.outlineColor,
    outlineWidth: layer.outlineWidth,
    target: layer.target,
    x: layer.x,
    y: layer.y,
    scale: layer.scale,
    rotationDeg: layer.rotationDeg,
    visible: layer.visible,
    locked: layer.locked,
  };
}

export async function createRashguardDraftDocument({
  id,
  name,
  spec,
  artworkLayers,
  thumbnailUrl,
  existingCreatedAt,
}: {
  id: string;
  name: string;
  spec: RashguardSerializedState;
  artworkLayers: RashguardArtworkLayer[];
  thumbnailUrl?: string;
  existingCreatedAt?: string;
}): Promise<RashguardDraftDocument> {
  const images = await Promise.all(
    artworkLayers.map((layer) => artworkLayerToDraftImage(layer)),
  );

  const now = new Date().toISOString();
  return {
    id,
    name,
    spec,
    images,
    thumbnailUrl,
    createdAt: existingCreatedAt ?? now,
    updatedAt: now,
  };
}

export function listSavedRashguardDesigns() {
  return readAllDrafts()
    .filter((draft) => draft.id !== AUTO_RASHGUARD_DRAFT_ID)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function readRashguardDraftDocument(id: string) {
  return readAllDrafts().find((draft) => draft.id === id) ?? null;
}

export function saveRashguardDraftDocument(draft: RashguardDraftDocument) {
  const drafts = readAllDrafts();
  const index = drafts.findIndex((item) => item.id === draft.id);
  const next =
    index >= 0
      ? drafts.map((item) => (item.id === draft.id ? draft : item))
      : [draft, ...drafts];
  writeAllDrafts(next);
}

export function deleteRashguardDraftDocument(id: string) {
  writeAllDrafts(readAllDrafts().filter((draft) => draft.id !== id));
}

export function createDraftArtworkObjectUrls(
  draft: RashguardDraftDocument,
): RashguardArtworkLayer[] {
  if (!Array.isArray(draft.images)) return [];
  return draft.images.map((image) => ({
    id: image.id,
    kind: image.kind ?? 'image',
    imageUrl: image.dataUrl,
    imageWidth: image.imageWidth,
    imageHeight: image.imageHeight,
    filename: image.filename,
    text: image.text,
    fontFamily: image.fontFamily,
    color: image.color,
    outlineColor: image.outlineColor,
    outlineWidth: image.outlineWidth,
    target: image.target,
    x: image.x,
    y: image.y,
    scale: image.scale,
    rotationDeg: image.rotationDeg,
    visible: image.visible,
    locked: image.locked === true,
    placementPending: false,
  }));
}
