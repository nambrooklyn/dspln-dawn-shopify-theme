import { useEffect, useState } from 'react';

import type { GiDraftDocument } from './gi-draft-storage';
import {
  KIMONO_LOGO_SLOT_LABEL,
  KIMONO_LOGO_SLOTS,
  PANT_LOGO_SLOT_LABEL,
  PANT_LOGO_SLOTS,
  type KimonoLogoSlot,
  type PantLogoSlot,
} from './gi-config';
import type { KimonoLogo } from './gi-state';

export interface UploadedLogoItem {
  key: string;
  url: string;
  filename: string;
  slot: string;
  designName: string;
  updatedAt: string;
  imageWidth: number;
  imageHeight: number;
}

export type LogoApplyTarget =
  | `kimono:${KimonoLogoSlot}`
  | `pant:${PantLogoSlot}`;

export const APPLY_TARGETS: Array<{ value: LogoApplyTarget; label: string }> = [
  ...KIMONO_LOGO_SLOTS.map((slot) => ({
    value: `kimono:${slot}` as const,
    label: KIMONO_LOGO_SLOT_LABEL[slot].replace(/^Logo on /, ''),
  })),
  ...PANT_LOGO_SLOTS.map((slot) => ({
    value: `pant:${slot}` as const,
    label: PANT_LOGO_SLOT_LABEL[slot].replace(/^Logo on /, ''),
  })),
];

export const KIMONO_UPLOAD_LABEL: Record<KimonoLogoSlot, string> = {
  'left-chest': 'Left Chest',
  'left-sleeve': 'Left Sleeve',
  'right-sleeve': 'Right Sleeve',
  back: 'Back',
  'back-skirt': 'Below Belt (Back)',
};

export const PANT_UPLOAD_LABEL: Record<PantLogoSlot, string> = {
  'left-pant': 'Left Thigh',
  'right-pant': 'Right Thigh',
};

/**
 * Every uploaded artwork visible to the current session: logos applied to the
 * design right now plus every image embedded in the saved designs (local +
 * cloud). Blob-backed images get object URLs that are revoked when the list
 * is rebuilt or the caller unmounts.
 */
export function useUploadedLogos({
  savedDesigns,
  currentKimonoLogos,
  currentPantLogos,
  activeDesignName,
  defaultDesignName,
}: {
  savedDesigns: GiDraftDocument[];
  currentKimonoLogos?: Partial<Record<KimonoLogoSlot, KimonoLogo>>;
  currentPantLogos?: Partial<Record<PantLogoSlot, KimonoLogo>>;
  activeDesignName?: string;
  defaultDesignName: string;
}): UploadedLogoItem[] {
  const [uploadedLogos, setUploadedLogos] = useState<UploadedLogoItem[]>([]);

  useEffect(() => {
    const objectUrls: string[] = [];
    const seen = new Set<string>();
    const items: UploadedLogoItem[] = [];
    const activeName = activeDesignName || defaultDesignName;

    Object.entries(currentKimonoLogos ?? {}).forEach(([slot, logo]) => {
      if (!logo) return;
      const key = `current|kimono|${slot}|${logo.filename}|${logo.imageUrl}`;
      seen.add(key);
      items.push({
        key,
        url: logo.imageUrl,
        filename: logo.filename,
        slot: `Kimono ${KIMONO_UPLOAD_LABEL[slot as KimonoLogoSlot] ?? slot}`,
        designName: activeName,
        updatedAt: new Date().toISOString(),
        imageWidth: logo.imageWidth,
        imageHeight: logo.imageHeight,
      });
    });

    Object.entries(currentPantLogos ?? {}).forEach(([slot, logo]) => {
      if (!logo) return;
      const key = `current|pant|${slot}|${logo.filename}|${logo.imageUrl}`;
      seen.add(key);
      items.push({
        key,
        url: logo.imageUrl,
        filename: logo.filename,
        slot: `Pant ${PANT_UPLOAD_LABEL[slot as PantLogoSlot] ?? slot}`,
        designName: activeName,
        updatedAt: new Date().toISOString(),
        imageWidth: logo.imageWidth,
        imageHeight: logo.imageHeight,
      });
    });

    savedDesigns.forEach((design) => {
      Object.entries(design.images.kimono).forEach(([slot, image]) => {
        if (!image) return;
        const key = `${image.filename}|${image.imageWidth}x${image.imageHeight}|${image.blob.size}`;
        if (seen.has(key)) return;
        seen.add(key);
        const url = URL.createObjectURL(image.blob);
        objectUrls.push(url);
        items.push({
          key,
          url,
          filename: image.filename,
          slot: `Kimono ${KIMONO_UPLOAD_LABEL[slot as KimonoLogoSlot] ?? slot}`,
          designName: design.name,
          updatedAt: design.updatedAt,
          imageWidth: image.imageWidth,
          imageHeight: image.imageHeight,
        });
      });

      Object.entries(design.images.pant).forEach(([slot, image]) => {
        if (!image) return;
        const key = `${image.filename}|${image.imageWidth}x${image.imageHeight}|${image.blob.size}`;
        if (seen.has(key)) return;
        seen.add(key);
        const url = URL.createObjectURL(image.blob);
        objectUrls.push(url);
        items.push({
          key,
          url,
          filename: image.filename,
          slot: `Pant ${PANT_UPLOAD_LABEL[slot as PantLogoSlot] ?? slot}`,
          designName: design.name,
          updatedAt: design.updatedAt,
          imageWidth: image.imageWidth,
          imageHeight: image.imageHeight,
        });
      });
    });

    setUploadedLogos(
      items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
    return () => objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [
    activeDesignName,
    currentKimonoLogos,
    currentPantLogos,
    defaultDesignName,
    savedDesigns,
  ]);

  return uploadedLogos;
}
