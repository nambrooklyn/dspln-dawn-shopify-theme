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
import { type CameraView } from '../gi/gi-config';
import { useGiState } from '../gi/gi-state';
import { type GiV2Anchor } from '../gi-v2/anchors';
import { useResolvedGiAnchors } from '../gi-v3/use-resolved-anchors';
import { GiV2OptionsPill } from '../gi-v2/v2-panels';
import type { GiMinimalShellProps } from '../gi-v2';
import { GiAnchorPanel } from '../gi-v3/anchor-panel';
import {
  QUIET_HOTSPOT_STYLES,
  QuietHotspotsLayer,
  type QuietMarker,
} from '../gi-v3/quiet-hotspots';

/**
 * V4 shell — one hotspot family at a time. A "Colors · Logos" text toggle
 * (top left, under Front/Back) shows either the colour/embroidery dots or
 * the logo squares, halving on-screen density. Scene starts clean and
 * reveals on the first tap, with the same quiet half-size markers as v3.
 */

const V4_EXTRA_STYLES = `
@keyframes dspln-v2-hint {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 0.95; }
}
.dspln-v2-hint { animation: dspln-v2-hint 2.8s ease-in-out infinite; }
`;

const BASE_VIEWS: CameraView[] = ['front', 'back'];
const TAP_SLOP_PX = 8;

type MarkerMode = 'colors' | 'logos';

const MODES: Array<{ id: MarkerMode; label: string }> = [
  { id: 'colors', label: 'Colors' },
  { id: 'logos', label: 'Logos' },
];

function isLogoAnchor(anchor: GiV2Anchor) {
  return anchor.kind === 'kimono-logo' || anchor.kind === 'pant-logo';
}

export const GiV4Shell = memo(
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
    const [mode, setMode] = useState<MarkerMode>('colors');
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

    const markers = useMemo<QuietMarker[]>(() => {
      if (!revealed) return [];
      return resolvedAnchors.filter(
        (anchor) =>
          partVisibility[anchor.part] &&
          (mode === 'logos' ? isLogoAnchor(anchor) : !isLogoAnchor(anchor)),
      ).map((anchor) => ({
        id: anchor.id,
        label: anchor.label,
        position: anchor.position,
        facing: anchor.facing,
        square: isLogoAnchor(anchor),
        filled: filledIds.has(anchor.id),
        plane: anchor.plane,
      }));
    }, [filledIds, mode, partVisibility, resolvedAnchors, revealed]);

    const handleMarkerSelect = useCallback(
      (marker: QuietMarker) => {
        const anchor = resolvedAnchors.find((item) => item.id === marker.id);
        if (!anchor) return;
        setActiveAnchor((prev) => {
          if (prev?.id === anchor.id) {
            setCameraView(baseView);
            return null;
          }
          setCameraView(anchor.view);
          return anchor;
        });
      },
      [baseView, resolvedAnchors, setCameraView],
    );

    const closePanel = useCallback(() => {
      setActiveAnchor(null);
      setCameraView(baseView);
    }, [baseView, setCameraView]);

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
        if (activeAnchor) closePanel();
      },
      [activeAnchor, closePanel, revealed],
    );

    const handleBaseView = useCallback(
      (view: CameraView) => {
        setBaseView(view);
        setActiveAnchor(null);
        setCameraView(view);
      },
      [setCameraView],
    );

    const handleMode = useCallback((next: MarkerMode) => {
      setRevealed(true);
      setMode(next);
      setActiveAnchor(null);
    }, []);

    const total = serialize().price.total;

    return (
      <div
        className="dspln-v2-root relative h-[100dvh] min-h-[26rem] w-full overflow-hidden bg-white"
        onPointerDown={handlePointerDown}
        onClick={handleRootClick}
      >
        <style>{QUIET_HOTSPOT_STYLES + V4_EXTRA_STYLES}</style>

        <GiCanvas
          overlay={
            <QuietHotspotsLayer
              markers={markers}
              activeId={activeAnchor?.id ?? null}
              onSelect={handleMarkerSelect}
            />
          }
        />

        {/* Front / Back + mode toggle — quiet text controls, top left */}
        <div className="absolute top-4 left-3 z-20 flex flex-col gap-2">
          <div className="flex items-center gap-2">
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
          <div className="flex items-center gap-2">
            {MODES.map(({ id, label }, index) => (
              <span key={id} className="flex items-center gap-2">
                {index > 0 ? (
                  <span className="text-[10px] text-black/25">·</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleMode(id)}
                  className={`pointer-events-auto text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
                    revealed && mode === id
                      ? 'text-black underline underline-offset-4'
                      : 'text-black/40 hover:text-black'
                  }`}
                >
                  {label}
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Sizes & parts — top right */}
        <div className="absolute top-3 right-3 z-20">
          <GiV2OptionsPill />
        </div>

        {/* Hint */}
        {!revealed || !activeAnchor ? (
          <div className="dspln-v2-hint pointer-events-none absolute top-14 left-1/2 z-20 w-full -translate-x-1/2 text-center">
            {!revealed ? (
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-black/70">
                Tap the gi to customize
              </p>
            ) : (
              <p className="text-[9px] uppercase tracking-[0.16em] text-black/45">
                {mode === 'colors'
                  ? 'tap a dot to change its color'
                  : 'tap a square to add a logo'}
              </p>
            )}
          </div>
        ) : null}

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

GiV4Shell.displayName = 'GiV4Shell';
