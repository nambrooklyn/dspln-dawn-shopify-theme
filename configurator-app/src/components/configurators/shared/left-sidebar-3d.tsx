import { memo, useEffect, useRef } from 'react';

import { useGiState } from '../gi/gi-state';
import { PART_CAMERA_VIEW, type GiPart } from '../gi/gi-config';
import { KimonoSections } from './part-sections/kimono-sections';
import { BeltSections } from './part-sections/belt-sections';
import { PantSections } from './part-sections/pant-sections';

const TAB_ORDER: GiPart[] = ['jacket', 'belt', 'pants'];
const TAB_LABEL: Record<GiPart, string> = {
  jacket: 'Kimono',
  belt: 'Belt',
  pants: 'Pant',
};

/**
 * Left sidebar. Top tabs (Kimono / Belt / Pant) select which part the
 * merchant is customizing. The panel below shows that part's
 * customization sections — these mirror the corresponding accordion
 * sections from the D2C reference at dspln.com/products/customgi.
 */
export const LeftSidebar3D = memo(() => {
  const { selectedPart, setSelectedPart, setCameraView } = useGiState();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Selecting a part frames it: belt/pants get close-ups, kimono the
  // full front view.
  const selectPartWithCamera = (part: GiPart) => {
    setSelectedPart(part);
    setCameraView(PART_CAMERA_VIEW[part]);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleRailNavigation = (event: Event) => {
      const detail = (event as CustomEvent<{ part?: GiPart; target?: string }>).detail;
      if (detail?.part) {
        setSelectedPart(detail.part);
        setCameraView(PART_CAMERA_VIEW[detail.part]);
      }

      window.setTimeout(() => {
        const scrollEl = scrollRef.current;
        if (!scrollEl) return;

        const top =
          detail?.target === 'uploads'
            ? Math.max(0, scrollEl.scrollHeight * 0.58)
            : detail?.target === 'text'
              ? 140
              : 0;
        scrollEl.scrollTo({ top, behavior: 'smooth' });
      }, 40);
    };

    window.addEventListener('dspln:configurator-rail:navigate', handleRailNavigation);
    return () =>
      window.removeEventListener(
        'dspln:configurator-rail:navigate',
        handleRailNavigation,
      );
  }, [setSelectedPart, setCameraView]);

  return (
    <div className="bg-background hidden h-full w-[clamp(14rem,22vw,20rem)] shrink-0 flex-col border-r lg:flex">
      <div className="border-b px-3 py-1.5">
        <div className="bg-muted/60 flex rounded-md p-1">
          {TAB_ORDER.map((part) => {
            const isActive = part === selectedPart;
            return (
              <button
                key={part}
                type="button"
                onClick={() => selectPartWithCamera(part)}
                className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'border-border bg-background text-foreground border shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {TAB_LABEL[part]}
              </button>
            );
          })}
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {selectedPart === 'jacket' && <KimonoSections />}
        {selectedPart === 'belt' && <BeltSections />}
        {selectedPart === 'pants' && <PantSections />}
      </div>
    </div>
  );
});

LeftSidebar3D.displayName = 'LeftSidebar3D';
