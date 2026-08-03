import { useCallback } from 'react';
import type { GiSerializedState, KimonoLogo } from '../gi/gi-state';
import type { KimonoLogoSlot, PantLogoSlot } from '../gi/gi-config';
import { isStudioMode } from './studio-mode';

interface UploadedLogosMap {
  [filename: string]: {
    imageUrl: string;
    filename: string;
    imageWidth?: number;
    imageHeight?: number;
  };
}

export function useGenerateTechPack(
  garmentType: 'gi' | 'womens-gi' | 'kids-gi' | 'rashguard' | string,
  serialize: () => GiSerializedState,
  state: any,
  uploadedLogos: UploadedLogosMap,
  currentDesignId?: string,
  currentDesignName?: string,
) {
  return useCallback(() => {
    if (!isStudioMode() || typeof window === 'undefined') return;

    const logoImages = Object.entries(uploadedLogos).reduce<Record<string, { dataUrl: string; filename: string; imageWidth: number; imageHeight: number }>>((acc, [filename, logo]) => {
      acc[filename] = {
        dataUrl: logo.imageUrl,
        filename: logo.filename || 'artwork.png',
        imageWidth: logo.imageWidth || 120,
        imageHeight: logo.imageHeight || 120,
      };
      return acc;
    }, {});

    const logoMap = state.logoMap ?? {};
    const designRecord = {
      id: currentDesignId || 'studio-design',
      name: currentDesignName || 'Design',
      orderName: `#studio-${Date.now()}`,
      configData: {
        source: 'studio',
        spec: serialize(),
        images: {
          kimono: Object.fromEntries(
            (Object.entries(logoMap.kimono ?? {}) as [KimonoLogoSlot, KimonoLogo][])
              .map(([slot, logo]) => [
                slot,
                { ...logo, dataUrl: logoImages[logo.filename]?.dataUrl || logo.imageUrl },
              ])
          ),
          pant: Object.fromEntries(
            (Object.entries(logoMap.pant ?? {}) as [PantLogoSlot, KimonoLogo][])
              .map(([slot, logo]) => [
                slot,
                { ...logo, dataUrl: logoImages[logo.filename]?.dataUrl || logo.imageUrl },
              ])
          ),
        },
      },
    };

    const encoded = btoa(JSON.stringify(designRecord));
    const techPackPath = garmentType.includes('rashguard') ? 'rashguard' : 'gi';
    window.open(`/tech-pack/${techPackPath}?design=${encoded}&silent=1`, '_blank', 'width=1200,height=800');
  }, [garmentType, serialize, state.logoMap, uploadedLogos, currentDesignId, currentDesignName]);
}
