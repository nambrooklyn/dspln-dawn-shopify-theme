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

    const designRecord = {
      id: currentDesignId || 'studio-design',
      name: (currentDesignName ?? undefined) || 'Design',
      orderName: `#studio-${Date.now()}`,
      configData: {
        source: 'studio',
        spec: serialize(),
      },
    };

    const encoded = btoa(JSON.stringify(designRecord));
    const techPackPath = garmentType.includes('rashguard') ? 'rashguard' : 'gi';
    window.open(`/tech-pack/${techPackPath}?design=${encoded}&silent=1`, '_blank', 'width=1200,height=800');
  }, [garmentType, serialize, uploadedLogos, currentDesignId, currentDesignName]);
}
