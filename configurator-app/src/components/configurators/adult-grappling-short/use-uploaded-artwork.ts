import { useMemo } from 'react';

import {
  RASHGUARD_ARTWORK_TARGET_LABELS,
  RASHGUARD_ARTWORK_TARGETS,
  type RashguardArtworkTarget,
} from './rashguard-config';
import type { RashguardDraftDocument } from './rashguard-storage';
import type { RashguardArtworkLayer } from './rashguard-state';

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

export function isRashguardArtworkTarget(
  value: string,
): value is RashguardArtworkTarget {
  return RASHGUARD_ARTWORK_TARGETS.some((target) => target === value);
}

/**
 * Turn a listed upload back into a File so it can flow through the same
 * addArtworkLayer path as a fresh device upload. The url is a data URL,
 * object URL, or hosted https URL — all fetchable.
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
 * Every customer image visible to the current session: image layers on the
 * design right now plus every image embedded in the saved designs. Unlike
 * the gi's blob-backed drafts, rashguard draft images store data URLs (or
 * hosted URLs), so they can be listed directly without object URLs.
 */
export function useUploadedArtwork({
  savedDesigns,
  currentArtworkLayers,
  activeDesignName,
  defaultDesignName,
}: {
  savedDesigns: RashguardDraftDocument[];
  currentArtworkLayers: RashguardArtworkLayer[];
  activeDesignName?: string;
  defaultDesignName: string;
}): UploadedArtworkItem[] {
  return useMemo(() => {
    const seen = new Set<string>();
    const items: UploadedArtworkItem[] = [];
    const activeName = activeDesignName || defaultDesignName;

    currentArtworkLayers.forEach((layer) => {
      if (layer.kind !== 'image' || !layer.imageUrl) return;
      const key = `current|${layer.id}|${layer.filename}`;
      seen.add(`${layer.filename}|${layer.imageWidth}x${layer.imageHeight}`);
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
      (design.images ?? []).forEach((image) => {
        if ((image.kind ?? 'image') !== 'image' || !image.dataUrl) return;
        const key = `${image.filename}|${image.imageWidth}x${image.imageHeight}`;
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

    return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [
    activeDesignName,
    currentArtworkLayers,
    defaultDesignName,
    savedDesigns,
  ]);
}
