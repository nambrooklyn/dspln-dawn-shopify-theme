import {
  memo,
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import { GiCanvas } from '../gi/gi-canvas';
import {
  GI_PART_DISPLAY,
  PART_CAMERA_VIEW,
  type CameraView,
  type GiPart,
} from '../gi/gi-config';
import { useGiState } from '../gi/gi-state';
import { type GiV2Anchor } from '../gi-v2/anchors';
import { useResolvedGiAnchors } from './use-resolved-anchors';
import { GiV2OptionsPill } from '../gi-v2/v2-panels';
import type { GiMinimalShellProps } from '../gi-v2';
import { GiAnchorPanel } from './anchor-panel';
import {
  QUIET_HOTSPOT_STYLES,
  QuietHotspotsLayer,
  type QuietMarker,
} from './quiet-hotspots';

/**
 * V3 shell — two-level hotspots. A fresh scene shows NOTHING; the first tap
 * on the gi reveals three quiet part dots (Kimono / Pant / Belt). Tapping a
 * part dot fans out only that part's options; tapping the background steps
 * back a level. At most ~6 markers are ever on screen.
 */

const V3_EXTRA_STYLES = `
@keyframes dspln-v2-hint {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 0.95; }
}
.dspln-v2-hint { animation: dspln-v2-hint 2.8s ease-in-out infinite; }
`;

const BASE_VIEWS: CameraView[] = ['front', 'back'];
const TAP_SLOP_PX = 8;

const PART_DOTS: Array<{ part: GiPart; marker: QuietMarker }> = [
  {
    part: 'jacket',
    marker: {
      id: 'part-jacket',
      label: 'Customize Kimono',
      position: [0.32, 1.7, 0.45],
      facing: [0, 0, 1],
    },
  },
  {
    part: 'pants',
    marker: {
      id: 'part-pants',
      label: 'Customize Pant',
      position: [-0.25, 0.85, 0.31],
      facing: [0, 0, 1],
    },
  },
  {
    part: 'belt',
    marker: {
      id: 'part-belt',
      label: 'Customize Belt',
      position: [0.22, 1.24, 0.47],
      facing: [0, 0, 1],
    },
  },
];

function anchorToMarker(anchor: GiV2Anchor, filledIds: Set<string>): QuietMarker {
  const square = anchor.kind === 'kimono-logo' || anchor.kind === 'pant-logo';
  return {
    id: anchor.id,
    label: anchor.label,
    position: anchor.position,
    facing: anchor.facing,
    square,
    filled: square && filledIds.has(anchor.id),
    plane: anchor.plane,
  };
}

export const GiV3Shell = memo(
  ({
    onAddToCart,
    isAddingToCart,
    cartActionLabel = 'Add to Cart',
    cartActionLoadingLabel = 'Adding…',
  }: GiMinimalShellProps) => {
    const {
      cameraView,
      setCameraView,
      partVisibility,
      kimonoLogos,
      pantLogos,
      serialize,
    } = useGiState();
    const resolvedAnchors = useResolvedGiAnchors();
    const [revealed, setRevealed] = useState(false);
    const [activePart, setActivePart] = useState<GiPart | null>(null);
    const [activeAnchor, setActiveAnchor] = useState<GiV2Anchor | null>(null);
    const [baseView, setBaseView] = useState<CameraView>('front');
    const downPosRef = useRef<{ x: number; y: number } | null>(null);

    const filledIds = useMemo(() => {
      const ids = new Set<string>();
      Object.entries(kimonoLogos).forEach(([slot, logo]) => {
        if (logo) ids.add(`kimono-logo-${slot}`);
      });
      Object.entries(pantLogos).forEach(([slot, logo]) => {
        if (logo) ids.add(`pant-logo-${slot}`);
      });
      return ids;
    }, [kimonoLogos, pantLogos]);

    const markers = useMemo(() => {
      if (!revealed) return [];
      if (!activePart) {
        return PART_DOTS.filter(({ part }) => partVisibility[part]).map(
          ({ marker }) => marker,
        );
      }
      return resolvedAnchors.filter((anchor) => anchor.part === activePart).map(
        (anchor) => anchorToMarker(anchor, filledIds),
      );
    }, [activePart, filledIds, partVisibility, resolvedAnchors, revealed]);

    const handleMarkerSelect = useCallback(
      (marker: QuietMarker) => {
        if (!activePart) {
          const partDot = PART_DOTS.find(({ marker: m }) => m.id === marker.id);
          if (!partDot) return;
          setActivePart(partDot.part);
          setCameraView(PART_CAMERA_VIEW[partDot.part]);
          return;
        }
        const anchor = resolvedAnchors.find((item) => item.id === marker.id);
        if (!anchor) return;
        setActiveAnchor((prev) => {
          if (prev?.id === anchor.id) {
            setCameraView(PART_CAMERA_VIEW[activePart]);
            return null;
          }
          setCameraView(anchor.view);
          return anchor;
        });
      },
      [activePart, resolvedAnchors, setCameraView],
    );

    const closePanel = useCallback(() => {
      setActiveAnchor(null);
      if (activePart) setCameraView(PART_CAMERA_VIEW[activePart]);
    }, [activePart, setCameraView]);

    // Reveal on first tap; a background tap steps back one level. Real taps
    // only — a drag (orbit) moves more than the slop and is ignored, and taps
    // on hotspots/panels never reach the canvas element.
    const handlePointerDown = useCallback((event: ReactPointerEvent) => {
      downPosRef.current = { x: event.clientX, y: event.clientY };
    }, []);

    const handleRootClick = useCallback(
      (event: ReactMouseEvent) => {
        const down = downPosRef.current;
        if (!down) return;
        const moved =
          Math.hypot(event.clientX - down.x, event.clientY - down.y) >
          TAP_SLOP_PX;
        if (moved) return;
        const target = event.target as HTMLElement | null;
        if (target?.tagName !== 'CANVAS') return;
        // A tap on a fabric-plane marker also lands on the canvas — the
        // marker flags the event so it doesn't double as a background tap.
        if (
          (event.nativeEvent as unknown as Record<string, unknown>)
            .__dsplnMarkerTap
        ) {
          return;
        }

        if (!revealed) {
          setRevealed(true);
          return;
        }
        if (activeAnchor) {
          closePanel();
          return;
        }
        if (activePart) {
          setActivePart(null);
          setCameraView(baseView);
        }
      },
      [activeAnchor, activePart, baseView, closePanel, revealed, setCameraView],
    );

    const handleBaseView = useCallback(
      (view: CameraView) => {
        setBaseView(view);
        setActiveAnchor(null);
        setActivePart(null);
        setCameraView(view);
      },
      [setCameraView],
    );

    const total = serialize().price.total;
    const activePartLabel = activePart ? GI_PART_DISPLAY[activePart] : null;

    return (
      <div
        className="dspln-v2-root relative h-[100dvh] min-h-[26rem] w-full overflow-hidden bg-white"
        onPointerDown={handlePointerDown}
        onClick={handleRootClick}
      >
        <style>{QUIET_HOTSPOT_STYLES + V3_EXTRA_STYLES}</style>

        <GiCanvas
          overlay={
            <QuietHotspotsLayer
              markers={markers}
              activeId={activeAnchor?.id ?? null}
              isPartLevel={!activePart}
              onSelect={handleMarkerSelect}
            />
          }
        />

        {/* Front / Back — quiet text toggle, top left */}
        <div className="absolute top-4 left-3 z-20 flex items-center gap-2">
          {BASE_VIEWS.map((view, index) => (
            <span key={view} className="flex items-center gap-2">
              {index > 0 ? (
                <span className="text-[10px] text-black/25">·</span>
              ) : null}
              <button
                type="button"
                onClick={() => handleBaseView(view)}
                className={`pointer-events-auto text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
                  cameraView === view
                    ? 'text-black underline underline-offset-4'
                    : 'text-black/40 hover:text-black'
                }`}
              >
                {view}
              </button>
            </span>
          ))}
        </div>

        {/* Sizes & parts — top right */}
        <div className="absolute top-3 right-3 z-20">
          <GiV2OptionsPill />
        </div>

        {/* Contextual hint per level */}
        <div className="dspln-v2-hint pointer-events-none absolute top-14 left-1/2 z-20 w-full -translate-x-1/2 text-center">
          {!revealed ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-black/70">
              Tap the gi to customize
            </p>
          ) : !activePart ? (
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-black/60">
              Pick a piece — kimono · pant · belt
            </p>
          ) : !activeAnchor ? (
            <p className="text-[9px] uppercase tracking-[0.16em] text-black/45">
              {activePartLabel} — circles color · squares add logos · tap away
              to go back
            </p>
          ) : null}
        </div>

        {/* Active hotspot panel */}
        <div className="pointer-events-none absolute bottom-20 left-1/2 z-30 flex w-full -translate-x-1/2 justify-center px-3">
          {activeAnchor ? (
            <GiAnchorPanel anchor={activeAnchor} onClose={closePanel} />
          ) : null}
        </div>

        {/* Add to cart */}
        <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
          <button
            type="button"
            onClick={onAddToCart}
            disabled={isAddingToCart}
            className="flex h-11 items-center gap-2.5 rounded-full bg-black px-6 text-[11px] font-semibold uppercase tracking-[0.12em] whitespace-nowrap text-white shadow-[0_6px_24px_rgba(0,0,0,0.25)] transition hover:scale-[1.03] disabled:opacity-60"
          >
            {isAddingToCart ? cartActionLoadingLabel : cartActionLabel}
            <span className="text-white/60">·</span>
            <span>${total}</span>
          </button>
        </div>
      </div>
    );
  },
);

GiV3Shell.displayName = 'GiV3Shell';
