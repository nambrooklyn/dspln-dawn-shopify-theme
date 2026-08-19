import { memo, useCallback, useMemo, useState } from 'react';

import { GiCanvas } from '../gi/gi-canvas';
import {
  BELT_COLOR_SWATCHES,
  GI_COLOR_SWATCHES,
  KIMONO_SUBPART_LABEL,
  PANT_SUBPART_LABEL,
  type CameraView,
} from '../gi/gi-config';
import { useGiState } from '../gi/gi-state';
import { GI_V2_ANCHORS, type GiV2Anchor } from './anchors';
import { GiV2HotspotsLayer } from './hotspots';
import {
  GiV2BeltEndPanel,
  GiV2ColorPanel,
  GiV2LogoPanel,
  GiV2OptionsPill,
} from './v2-panels';

/**
 * Minimal Vectary-style shell for the gi: full-bleed scene, pulsing hotspots,
 * one floating panel at a time. A hotspot tap also glides the camera to the
 * same close-up view the v1 sidebar used for that option; closing the panel
 * returns to the base front/back view.
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
.dspln-v2-hotspot-square.is-filled {
  border-style: solid;
  background: rgba(255, 255, 255, 0.85);
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

const BASE_VIEWS: CameraView[] = ['front', 'back'];

interface GiV2ShellProps {
  onAddToCart: () => void;
  isAddingToCart?: boolean;
  cartActionLabel?: string;
  cartActionLoadingLabel?: string;
}

export const GiV2Shell = memo(
  ({
    onAddToCart,
    isAddingToCart,
    cartActionLabel = 'Add to Cart',
    cartActionLoadingLabel = 'Adding…',
  }: GiV2ShellProps) => {
    const {
      cameraView,
      setCameraView,
      partVisibility,
      partColors,
      setPartColor,
      kimonoSubColors,
      setKimonoSubColor,
      pantSubColors,
      setPantSubColor,
      kimonoLogos,
      setKimonoLogo,
      removeKimonoLogo,
      pantLogos,
      setPantLogo,
      removePantLogo,
      serialize,
    } = useGiState();
    const [activeAnchor, setActiveAnchor] = useState<GiV2Anchor | null>(null);
    const [baseView, setBaseView] = useState<CameraView>('front');
    const [hasInteracted, setHasInteracted] = useState(false);

    const visibleAnchors = useMemo(
      () => GI_V2_ANCHORS.filter((anchor) => partVisibility[anchor.part]),
      [partVisibility],
    );

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

    const handleSelectAnchor = useCallback(
      (anchor: GiV2Anchor) => {
        setHasInteracted(true);
        setActiveAnchor((prev) => {
          if (prev?.id === anchor.id) {
            setCameraView(baseView);
            return null;
          }
          setCameraView(anchor.view);
          return anchor;
        });
      },
      [baseView, setCameraView],
    );

    const closePanel = useCallback(() => {
      setActiveAnchor(null);
      setCameraView(baseView);
    }, [baseView, setCameraView]);

    const handleBaseView = useCallback(
      (view: CameraView) => {
        setBaseView(view);
        setActiveAnchor(null);
        setCameraView(view);
      },
      [setCameraView],
    );

    const total = serialize().price.total;

    const activePanel = (() => {
      if (!activeAnchor) return null;
      switch (activeAnchor.kind) {
        case 'kimono-color':
          return (
            <GiV2ColorPanel
              title={KIMONO_SUBPART_LABEL[activeAnchor.sub]}
              value={kimonoSubColors[activeAnchor.sub]}
              swatches={GI_COLOR_SWATCHES}
              onChange={(hex) => setKimonoSubColor(activeAnchor.sub, hex)}
              onClose={closePanel}
            />
          );
        case 'pant-color':
          return (
            <GiV2ColorPanel
              title={PANT_SUBPART_LABEL[activeAnchor.sub]}
              value={pantSubColors[activeAnchor.sub]}
              swatches={GI_COLOR_SWATCHES}
              onChange={(hex) => setPantSubColor(activeAnchor.sub, hex)}
              onClose={closePanel}
            />
          );
        case 'belt-color':
          return (
            <GiV2ColorPanel
              title="Belt Color"
              value={partColors.belt}
              swatches={BELT_COLOR_SWATCHES}
              onChange={(hex) => setPartColor('belt', hex)}
              onClose={closePanel}
            />
          );
        case 'belt-end':
          return <GiV2BeltEndPanel end={activeAnchor.end} onClose={closePanel} />;
        case 'kimono-logo': {
          const logo = kimonoLogos[activeAnchor.slot];
          return (
            <GiV2LogoPanel
              label={activeAnchor.label}
              imageUrl={logo?.imageUrl}
              filename={logo?.filename}
              onUpload={(file, dimensions) => {
                setKimonoLogo(activeAnchor.slot, {
                  imageUrl: URL.createObjectURL(file),
                  imageWidth: dimensions.width,
                  imageHeight: dimensions.height,
                  filename: file.name,
                  file,
                });
              }}
              onRemove={() => removeKimonoLogo(activeAnchor.slot)}
              onClose={closePanel}
            />
          );
        }
        case 'pant-logo': {
          const logo = pantLogos[activeAnchor.slot];
          return (
            <GiV2LogoPanel
              label={activeAnchor.label}
              imageUrl={logo?.imageUrl}
              filename={logo?.filename}
              onUpload={(file, dimensions) => {
                setPantLogo(activeAnchor.slot, {
                  imageUrl: URL.createObjectURL(file),
                  imageWidth: dimensions.width,
                  imageHeight: dimensions.height,
                  filename: file.name,
                  file,
                });
              }}
              onRemove={() => removePantLogo(activeAnchor.slot)}
              onClose={closePanel}
            />
          );
        }
        default:
          return null;
      }
    })();

    return (
      <div className="dspln-v2-root relative h-[100dvh] min-h-[26rem] w-full overflow-hidden bg-white">
        <style>{V2_STYLES}</style>

        <GiCanvas
          overlay={
            <GiV2HotspotsLayer
              anchors={visibleAnchors}
              activeId={activeAnchor?.id ?? null}
              visible
              filledIds={filledIds}
              onSelect={handleSelectAnchor}
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

        {/* Quiet hint until the first tap */}
        {!hasInteracted ? (
          <div className="dspln-v2-hint pointer-events-none absolute top-14 left-1/2 z-20 w-full -translate-x-1/2 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-black/70">
              Tap a pulsing spot
            </p>
            <p className="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-black/40">
              circles change colors · squares add logos
            </p>
          </div>
        ) : null}

        {/* Active hotspot panel */}
        <div className="pointer-events-none absolute bottom-20 left-1/2 z-30 flex w-full -translate-x-1/2 justify-center px-3">
          {activePanel}
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

GiV2Shell.displayName = 'GiV2Shell';
