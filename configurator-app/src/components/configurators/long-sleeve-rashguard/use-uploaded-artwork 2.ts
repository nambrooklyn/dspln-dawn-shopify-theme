import { useEffect, useState } from 'react';

import {
  RASHGUARD_ARTWORK_TARGET_LABELS,
  RASHGUARD_ARTWORK_TARGETS,
  type RashguardArtworkTarget,
} from './rashguard-config';
import type { RashguardArtworkLayer } from './rashguard-state';
import type { RashguardDraftDocument } from './rashguard-storage';

export interface UploadedArtworkItem {
  key: string;
  url: string;
  filename: string;
  designName: string;
  updatedAt: string;
  imageWidth: number;
  imageHeight: number;
}

export const APPLY_TARGETS: Array<{
  value: RashguardArtworkTarget;
  label: string;
}> = RASHGUARD_ARTWORK_TARGETS.map((target) => ({
  value: target,
  label: RASHGUARD_ARTWORK_TARGET_LABELS[target],
}));

/**
 * Rebuild an upload as a File so it can flow through addArtworkLayer
 * exactly like a fresh device upload (object URL, print shrink, save).
 */
export async function uploadedArtworkToFile(
  item: UploadedArtworkItem,
): Promise<File | null> {
  try {
    const response = await fetch(item.url);
    const blob = await response.blob();
    return new File([blob], item.filename || 'artwork.png', {
      type: blob.type || 'image/png',
    });
  } catch {
    return null;
  }
}

/**
 * Every uploaded artwork visible to the current session: image layers on
 * the design right now plus every image embedded in the saved designs.
 * Saved-design images are stored as data URLs, so no object URLs are
 * needed — the list is plain strings safe to render anywhere.
 */
export function useUploadedArtwork({
  savedDesigns,
  currentArtworkLayers,
  activeDesignName,
  defaultDesignName,
}: {
  savedDesigns: RashguardDraftDocument[];
  currentArtworkLayers?: RashguardArtworkLayer[];
  activeDesignName?: string;
  defaultDesignName: string;
}): UploadedArtworkItem[] {
  const [uploadedArtwork, setUploadedArtwork] = useState<UploadedArtworkItem[]>(
    [],
  );

  useEffect(() => {
    const seen = new Set<string>();
    const items: UploadedArtworkItem[] = [];
    const activeName = activeDesignName || defaultDesignName;

    (currentArtworkLayers ?? []).forEach((layer) => {
      if (layer.kind !== 'image' || !layer.imageUrl) return;
      const key = `current|${layer.id}|${layer.filename}|${layer.imageUrl}`;
      seen.add(key);
      items.push({
        key,
        url: layer.imageUrl,
        filename: layer.filename,
        designName: activeName,
        updatedAt: new Date().toISOString(),
        imageWidth: layer.imageWidth,
        imageHeight: layer.imageHeight,
      });
    });

    savedDesigns.forEach((design) => {
      if (!Array.isArray(design.images)) return;
      design.images.forEach((image) => {
        if ((image.kind ?? 'image') !== 'image' || !image.dataUrl) return;
        const key = `${image.filename}|${image.imageWidth}x${image.imageHeight}|${image.dataUrl.length}`;
        if (seen.has(key)) return;
        seen.add(key);
        items.push({
          key,
          url: image.dataUrl,
          filename: image.filename,
          designName: design.name,
          updatedAt: design.updatedAt,
          imageWidth: image.imageWidth,
          imageHeight: image.imageHeight,
        });
      });
    });

    setUploadedArtwork(
      items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  }, [
    activeDesignName,
    currentArtworkLayers,
    defaultDesignName,
    savedDesigns,
  ]);

  return uploadedArtwork;
}
