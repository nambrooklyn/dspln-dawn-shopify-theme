import { useCallback } from 'react';
import { isStudioMode } from './studio-mode';

interface AppliedLogo {
  imageUrl: string;
  filename?: string;
  imageWidth?: number;
  imageHeight?: number;
}

interface AppliedLogoMaps {
  kimono?: Record<string, AppliedLogo | undefined>;
  pant?: Record<string, AppliedLogo | undefined>;
}

function logosToSavedImages(logos?: Record<string, AppliedLogo | undefined>) {
  return Object.fromEntries(
    Object.entries(logos ?? {})
      .filter(([, logo]) => logo?.imageUrl)
      .map(([slot, logo]) => [
        slot,
        {
          dataUrl: logo!.imageUrl,
          filename: logo!.filename || 'artwork.png',
          imageWidth: logo!.imageWidth || 120,
          imageHeight: logo!.imageHeight || 120,
        },
      ]),
  );
}

export function useGenerateTechPack(
  garmentType: string,
  serialize: () => any,
  logos: AppliedLogoMaps,
  currentDesignId?: string,
  currentDesignName: string | null | undefined = undefined,
) {
  return useCallback(() => {
    if (!isStudioMode() || typeof window === 'undefined') return;

    const isRashguard =
      garmentType.includes('rashguard') || garmentType === 'adult-grappling-short';
    // The tech pack pages route to the right 3D model by configData.source.
    const source = isRashguard ? garmentType : `dspln-${garmentType}-configurator`;

    const designRecord = {
      id: currentDesignId || 'studio-design',
      name: (currentDesignName ?? undefined) || 'Design',
      orderName: `#studio-${Date.now()}`,
      configData: {
        source,
        spec: serialize(),
        images: {
          kimono: logosToSavedImages(logos.kimono),
          pant: logosToSavedImages(logos.pant),
        },
      },
    };

    // Hand the payload over via localStorage: logo images make it far too
    // large for a URL, and the tech pack tab is same-origin.
    const inlineKey = `dspln:studio-tech-pack:${Date.now()}`;
    try {
      window.localStorage.setItem(inlineKey, JSON.stringify(designRecord));
    } catch {
      return;
    }
    const techPackPath = isRashguard ? 'rashguard' : 'gi';
    window.open(`/tech-pack/${techPackPath}?inline=${encodeURIComponent(inlineKey)}`, '_blank', 'width=1200,height=800');
  }, [garmentType, serialize, logos, currentDesignId, currentDesignName]);
}
