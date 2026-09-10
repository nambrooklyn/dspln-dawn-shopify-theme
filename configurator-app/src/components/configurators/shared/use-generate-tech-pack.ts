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

    // Garments on the rashguard plumbing pass their slug through as the source;
    // the gi-family ones get wrapped in the dspln-*-configurator form.
    const isRashguard =
      garmentType.includes('rashguard') ||
      garmentType === 'adult-grappling-short' ||
      garmentType === 'kids-baseball-short';
    // The tech pack pages route to the right 3D model by configData.source.
    const source = isRashguard ? garmentType : `dspln-${garmentType}-configurator`;

    const techPackPath = isRashguard ? 'rashguard' : 'gi';

    // A saved design generates from its cloud record by id. The localStorage
    // handoff CANNOT be used here: on the live site this configurator runs in
    // an iframe on dspln.com, and the browser partitions the iframe's
    // localStorage away from the top-level popup window (same origin or not),
    // so the popup would find nothing — "Missing design id." This also keeps
    // the admin-edit contract honest: the tech pack shows the SAVED design,
    // exactly what the factory receives.
    if (currentDesignId) {
      window.open(
        `/tech-pack/${techPackPath}?id=${encodeURIComponent(currentDesignId)}`,
        '_blank',
        'width=1200,height=800',
      );
      return;
    }

    const designRecord = {
      id: 'studio-design',
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

    // Unsaved design: hand the payload over via localStorage (logo images are
    // far too large for a URL). Only reliable in a top-level tab, never in the
    // storefront iframe — but an iframe session always has a design id.
    const inlineKey = `dspln:studio-tech-pack:${Date.now()}`;
    try {
      window.localStorage.setItem(inlineKey, JSON.stringify(designRecord));
    } catch {
      return;
    }
    window.open(`/tech-pack/${techPackPath}?inline=${encodeURIComponent(inlineKey)}`, '_blank', 'width=1200,height=800');
  }, [garmentType, serialize, logos, currentDesignId, currentDesignName]);
}
