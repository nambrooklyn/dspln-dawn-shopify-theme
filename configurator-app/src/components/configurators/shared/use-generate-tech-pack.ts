import { useCallback } from 'react';
import { isStudioMode } from './studio-mode';

export function useGenerateTechPack(
  garmentType: string,
  serialize: () => any,
  uploadedLogos: any,
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
      },
    };

    const encoded = btoa(JSON.stringify(designRecord));
    const techPackPath = isRashguard ? 'rashguard' : 'gi';
    window.open(`/tech-pack/${techPackPath}?design=${encoded}`, '_blank', 'width=1200,height=800');
  }, [garmentType, serialize, uploadedLogos, currentDesignId, currentDesignName]);
}
