import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  RASHGUARD_SLOT_TARGET_PART,
  type CameraView,
  type RashguardArtworkTarget,
} from '../short-sleeve-rashguard/rashguard-config';
import { useRashguardState } from '../short-sleeve-rashguard/rashguard-state';
import { V2_ALL_ANCHORS, type V2HotspotAnchor } from './anchors';
import { V2HotspotsLayer, uvPointForAnchorOnScene } from './hotspots';
import { V2Canvas } from './v2-canvas';
import {
  V2ColorPanel,
  V2LayerEditor,
  V2LogoPanel,
  V2SizePill,
} from './v2-panels';

/**
 * Minimal Vectary-style shell: the 3D scene IS the interface. No sidebars, no
 * chrome — pulsing hotspots on the garment open one floating panel at a time,
 * and the only persistent UI is a hint, the size pill, the view toggle, the
 * camera arrows (inside the canvas) and the add-to-cart pill.
 */

const V2_STYLES = `
@keyframes dspln-v2-pulse {
  0% { box-shadow: 0 0 0 0 rgba(0, 0, 0, 0.28); }
  70% { box-shadow: 0 0 0 11px rgba(0, 0, 0, 0); }
  100% { box-shadow: 0 0 0 0 rgba(0, 0, 0, 0); }
}
.dspln-v2-hotspot-dot {
  width: 18px;
  height: 18px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.95);
  border: 1.5px solid rgba(0, 0, 0, 0.55);
  animation: dspln-v2-pulse 2.2s ease-out infinite;
  transition: transform 140ms ease;
  cursor: pointer;
}
.dspln-v2-hotspot-dot:hover,
.dspln-v2-hotspot-dot.is-active {
  transform: scale(1.35);
  animation: none;
}
.dspln-v2-hotspot-square {
  width: 34px;
  height: 34px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.16);
  border: 1.5px dashed rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: dspln-v2-pulse 2.2s ease-out infinite;
  animation-delay: 0.6s;
  transition: transform 140ms ease, background 140ms ease;
  cursor: pointer;
}
.dspln-v2-hotspot-square:hover,
.dspln-v2-hotspot-square.is-active {
  transform: scale(1.12);
  background: rgba(255, 255, 255, 0.7);
  animation: none;
}
.dspln-v2-hotspot-plus {
  font-size: 15px;
  line-height: 1;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.65);
}
@keyframes dspln-v2-hint {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 0.95; }
}
.dspln-v2-hint {
  animation: dspln-v2-hint 2.8s ease-in-out infinite;
}
`;

const VIEWS: CameraView[] = ['front', 'back'];

interface V2ShellProps {
  onAddToCart: () => void;
  isAddingToCart?: boolean;
  cartActionLabel?: string;
  cartActionLoadingLabel?: string;
}

export const V2Shell = memo(
  ({
    onAddToCart,
    isAddingToCart,
    cartActionLabel = 'Add to Cart',
    cartActionLoadingLabel = 'Adding…',
  }: V2ShellProps) => {
    const {
      addArtworkLayer,
      addTextLayer,
      artworkLayers,
      calculateTotal,
      cameraView,
      selectedArtworkLayerId,
      selectArtworkLayer,
      setCameraView,
      updateArtworkLayer,
    } = useRashguardState();
    const [activeAnchor, setActiveAnchor] = useState<V2HotspotAnchor | null>(
      null,
    );
    const [hasInteracted, setHasInteracted] = useState(false);
    // Layer added from a hotspot square → drop it at that square once the new
    // layer id lands in state (addArtworkLayer selects the new layer).
    const pendingPlacementRef = useRef<{
      anchor: V2HotspotAnchor;
      knownLayerIds: Set<string>;
    } | null>(null);

    const selectedLayer = artworkLayers.find(
      (layer) => layer.id === selectedArtworkLayerId,
    );

    // Hydrating a saved design auto-selects its last layer (v1 sidebar
    // behavior) — in v2 that would open the layer editor over a fresh page.
    // Clear it once on mount; taps re-select as usual.
    const mountTimeRef = useRef(
      typeof performance !== 'undefined' ? performance.now() : 0,
    );
    const clearedInitialSelectionRef = useRef(false);
    useEffect(() => {
      if (clearedInitialSelectionRef.current) return;
      if (!selectedArtworkLayerId) return;
      clearedInitialSelectionRef.current = true;
      // Only auto-clear selections that appear right after mount (hydration);
      // a genuine early tap keeps its editor.
      if (performance.now() - mountTimeRef.current < 1500) {
        selectArtworkLayer(null);
      }
    }, [selectedArtworkLayerId, selectArtworkLayer]);

    const handleSelectAnchor = useCallback(
      (anchor: V2HotspotAnchor) => {
        setHasInteracted(true);
        selectArtworkLayer(null);
        setActiveAnchor((prev) => (prev?.id === anchor.id ? null : anchor));
      },
      [selectArtworkLayer],
    );

    const closePanel = useCallback(() => setActiveAnchor(null), []);

    // A logo/text added from a hotspot square lands exactly at the square:
    // raycast the anchor onto the target mesh for the layer's UV point.
    useEffect(() => {
      const pending = pendingPlacementRef.current;
      if (!pending) return;
      const newLayer = artworkLayers.find(
        (layer) => !pending.knownLayerIds.has(layer.id),
      );
      if (!newLayer) return;
      pendingPlacementRef.current = null;

      const scene =
        typeof window !== 'undefined'
          ? ((window as unknown as Record<string, unknown>)
              .__rashguardScene as Parameters<
              typeof uvPointForAnchorOnScene
            >[0]) ?? null
          : null;
      const point = uvPointForAnchorOnScene(
        scene,
        pending.anchor,
        newLayer.target,
      );
      updateArtworkLayer(newLayer.id, {
        ...(point ?? {}),
        placementPending: false,
      });
    }, [artworkLayers, updateArtworkLayer]);

    const beginSlotPlacement = useCallback(
      (anchor: V2HotspotAnchor) => {
        pendingPlacementRef.current = {
          anchor,
          knownLayerIds: new Set(artworkLayers.map((layer) => layer.id)),
        };
      },
      [artworkLayers],
    );

    const handleSlotUpload = useCallback(
      (file: File, dimensions: { width: number; height: number }) => {
        const anchor = activeAnchor;
        if (!anchor?.slot) return;
        const target: RashguardArtworkTarget =
          RASHGUARD_SLOT_TARGET_PART[anchor.slot] as RashguardArtworkTarget;
        beginSlotPlacement(anchor);
        addArtworkLayer({ file, dimensions, target, placementPending: true });
        setActiveAnchor(null);
      },
      [activeAnchor, addArtworkLayer, beginSlotPlacement],
    );

    const handleSlotText = useCallback(() => {
      const anchor = activeAnchor;
      if (!anchor?.slot) return;
      const target: RashguardArtworkTarget =
        RASHGUARD_SLOT_TARGET_PART[anchor.slot] as RashguardArtworkTarget;
      beginSlotPlacement(anchor);
      addTextLayer({ target });
      setActiveAnchor(null);
    }, [activeAnchor, addTextLayer, beginSlotPlacement]);

    // Selecting a layer (tap on the garment) opens the layer editor and closes
    // any hotspot panel; hotspot dims handled by activeAnchor.
    useEffect(() => {
      if (selectedArtworkLayerId) setActiveAnchor(null);
    }, [selectedArtworkLayerId]);

    const total = calculateTotal();

    return (
      <div className="dspln-v2-root relative h-[100dvh] min-h-[26rem] w-full overflow-hidden bg-white">
        <style>{V2_STYLES}</style>

        <V2Canvas
          overlay={
            <V2HotspotsLayer
              anchors={V2_ALL_ANCHORS}
              activeId={activeAnchor?.id ?? null}
              visible={!selectedLayer}
              onSelect={handleSelectAnchor}
            />
          }
        />

        {/* Front / Back — quiet text toggle, top left */}
        <div className="absolute top-4 left-3 z-20 flex items-center gap-2">
          {VIEWS.map((view, index) => (
            <span key={view} className="flex items-center gap-2">
              {index > 0 ? (
                <span className="text-[10px] text-black/25">·</span>
              ) : null}
              <button
                type="button"
                onClick={() => setCameraView(view)}
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

        {/* Size — top right, floating */}
        <div className="absolute top-3 right-3 z-20">
          <V2SizePill />
        </div>

        {/* Top hint — Vectary-style quiet instruction, gone after first tap */}
        {!hasInteracted && !selectedLayer ? (
          <div className="dspln-v2-hint pointer-events-none absolute top-14 left-1/2 z-20 w-full -translate-x-1/2 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-black/70">
              Tap a pulsing spot
            </p>
            <p className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-black/40">
              circles change colors · squares add logos
            </p>
          </div>
        ) : null}

        {/* Active hotspot panel / layer editor — floats above the cart pill */}
        <div className="pointer-events-none absolute bottom-20 left-1/2 z-30 flex w-full -translate-x-1/2 justify-center px-3">
          {selectedLayer ? (
            <V2LayerEditor
              layer={selectedLayer}
              onClose={() => selectArtworkLayer(null)}
            />
          ) : activeAnchor?.kind === 'color' && activeAnchor.part ? (
            <V2ColorPanel part={activeAnchor.part} onClose={closePanel} />
          ) : activeAnchor?.kind === 'logo' && activeAnchor.slot ? (
            <V2LogoPanel
              label={activeAnchor.label}
              target={
                RASHGUARD_SLOT_TARGET_PART[
                  activeAnchor.slot
                ] as RashguardArtworkTarget
              }
              onUpload={handleSlotUpload}
              onAddText={handleSlotText}
              onClose={closePanel}
            />
          ) : null}
        </div>

        {/* Add to cart — the one loud element */}
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

V2Shell.displayName = 'V2Shell';
