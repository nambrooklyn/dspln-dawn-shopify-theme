import { memo, useEffect, useRef } from 'react';

import { useGiState } from './gi-state';
import { PART_CAMERA_VIEW, type GiPart } from './gi-config';
import { KimonoSections } from './part-sections/kimono-sections';

/**
 * Left sidebar. Single-item product: no part tabs — the panel shows this
 * item's customization sections directly.
 */
export const LeftSidebar3D = memo(() => {
  const { setSelectedPart, setCameraView } = useGiState();
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <KimonoSections />
      </div>
    </div>
  );
});

LeftSidebar3D.displayName = 'LeftSidebar3D';
