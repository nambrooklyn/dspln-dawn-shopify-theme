import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { Menu as MenuIcon, Plus, ShoppingBag, X } from 'lucide-react';

import { GiCanvas } from '../gi/gi-canvas';
import {
  GI_PART_DISPLAY,
  GI_PART_PRICES,
  PART_CAMERA_VIEW,
  type CameraView,
  type GiPart,
} from '../gi/gi-config';
import { useGiState } from '../gi/gi-state';
import { type GiV2Anchor } from '../gi-v2/anchors';
import { useResolvedGiAnchors } from '../gi-v3/use-resolved-anchors';
import type { GiMinimalShellProps } from '../gi-v2';
import { GiAnchorPanel } from '../gi-v3/anchor-panel';
import {
  QUIET_HOTSPOT_STYLES,
  QuietHotspotsLayer,
  type QuietMarker,
} from '../gi-v3/quiet-hotspots';
import { GiV5ZoneColorMenu } from './zone-color-menu';
import { GiV5CartDrawer } from './cart-drawer';
import {
  DesignAssistant,
  shouldShowDesignAssistant,
} from '../../design-assistant/design-assistant';

/** Speech-bubble AI mark (Nam's reference): sparkles + "AI" in brand red. */
function AssistantBubbleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 90" className={className} aria-hidden="true">
      <path
        fill="#5c0000"
        d="M50 1C22.4 1 1 19.4 1 43.5c0 24 21.4 42.4 49 42.4 7 0 13.7-1.2 19.8-3.4L88 89l-5.6-16.4C92.9 64.9 99 54.8 99 43.5 99 19.4 77.6 1 50 1Z"
      />
      {/* Inner art scaled toward center so it keeps a margin from the
          bubble's edges. */}
      <g transform="translate(50 43) scale(0.78) translate(-56 -40)">
        <path
          fill="#fff"
          d="M33 20c2.6 13.4 6.6 17.4 20 20-13.4 2.6-17.4 6.6-20 20-2.6-13.4-6.6-17.4-20-20 13.4-2.6 17.4-6.6 20-20Z"
        />
        <path
          fill="#fff"
          d="M56 12c1.5 7.7 3.8 10 11.5 11.5C59.8 25 57.5 27.3 56 35c-1.5-7.7-3.8-10-11.5-11.5C52.2 22 54.5 19.7 56 12Z"
        />
        <path
          fill="#fff"
          d="M56 45c1.5 7.7 3.8 10 11.5 11.5C59.8 58 57.5 60.3 56 68c-1.5-7.7-3.8-10-11.5-11.5C52.2 55 54.5 52.7 56 45Z"
        />
        <text
          x="79"
          y="52"
          textAnchor="middle"
          fill="#fff"
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="30"
          fontWeight="700"
        >
          AI
        </text>
      </g>
    </svg>
  );
}

/**
 * V5 shell — a fixed vertical rail of labelled ⊕ markers (Kimono / Belt /
 * Pant) to the LEFT of the model. Tapping a ⊕ reveals that part's hotspots;
 * tapping it again (or the background) hides them. The garment itself starts
 * completely clean. (Leader lines connecting the rail to the model were
 * tried and removed — the labelled buttons read clearly on their own.)
 */

const V5_EXTRA_STYLES = `
@keyframes dspln-v5-ring {
  0% { box-shadow: 0 0 0 0 rgba(0, 0, 0, 0.18); }
  70% { box-shadow: 0 0 0 9px rgba(0, 0, 0, 0); }
  100% { box-shadow: 0 0 0 0 rgba(0, 0, 0, 0); }
}
.dspln-v5-plus {
  animation: dspln-v5-ring 2.8s ease-out infinite;
}
.dspln-v5-plus.is-active { animation: none; }
@keyframes dspln-v5-intro-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(6px); }
}
.dspln-v5-intro-arrow { animation: dspln-v5-intro-bob 1.2s ease-in-out infinite; }
@keyframes dspln-v5-drop {
  from { opacity: 0; transform: translateY(28px); }
  to { opacity: 1; transform: translateY(0); }
}
.dspln-v5-drop {
  opacity: 0;
  animation: dspln-v5-drop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
@keyframes dspln-v5-intro-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
.dspln-v5-intro-overlay { animation: dspln-v5-intro-fade 0.4s ease-out; }
/* Chatra's collapsed bubble: mirror the AI assistant bubble exactly
   (48px, 16px from the side, 24px from the bottom) for symmetry. */
#chatra:not(.chatra--expanded) {
  width: 48px !important;
  height: 48px !important;
  right: 16px !important;
  bottom: 24px !important;
}
`;

const TAP_SLOP_PX = 8;

const RAIL_PARTS: GiPart[] = ['jacket', 'belt', 'pants'];

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

export const GiV5Shell = memo(
  ({
    onAddToCart,
    isAddingToCart,
    cartActionLabel = 'Add to Cart',
    cartActionLoadingLabel = 'Adding…',
  }: GiMinimalShellProps) => {
    const {
      setCameraView,
      partVisibility,
      kimonoLogos,
      pantLogos,
      serialize,
    } = useGiState();
    const [activePart, setActivePart] = useState<GiPart | null>(null);
    const [activeAnchor, setActiveAnchor] = useState<GiV2Anchor | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
    const [showAssistant] = useState(shouldShowDesignAssistant);
    const [assistantSignal, setAssistantSignal] = useState(0);
    const [baseView] = useState<CameraView>('front-far');
    // Onboarding, three beats on every page load (Nam's call — was
    // first-visit-only): rail buttons drop in, the screen dims with a
    // one-line hint, then the Kimono menu opens itself. Any tap
    // fast-forwards.
    const [firstVisit] = useState(true);
    const [showIntro, setShowIntro] = useState(false);
    const introDoneRef = useRef(false);
    const dismissIntro = useCallback(() => {
      introDoneRef.current = true;
      setShowIntro(false);
    }, []);
    // Beat 4: after the Kimono menu opens, two callouts name the app's two
    // verbs (squares = logos, swatches = colors). Any tap clears them.
    const [showHints, setShowHints] = useState(false);
    const hintsCancelledRef = useRef(false);

    // Rest at the slightly wider default framing on mount.
    useEffect(() => {
      setCameraView(baseView);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Chatra live chat (same ID as the theme) — its default bubble docks
    // bottom-right. Skipped when embedded: the Shopify parent page already
    // loads Chatra, and two widgets would stack.
    useEffect(() => {
      if (window.parent !== window) return;
      const w = window as unknown as {
        ChatraID?: string;
        Chatra?: { (...args: unknown[]): void; q?: unknown[] };
      };
      if (w.ChatraID) return;
      w.ChatraID = 'f7ADGR9D2eHaJjNcN';
      const chatra: { (...args: unknown[]): void; q?: unknown[] } =
        w.Chatra ??
        function (...args: unknown[]) {
          chatra.q = chatra.q ?? [];
          chatra.q.push(args);
        };
      w.Chatra = chatra;
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://call.chatra.io/chatra.js';
      document.head.appendChild(script);
    }, []);

    // The theme's cart-bridge reports the menu drawer's real open/closed
    // state, so the hamburger/X stays right even when the drawer is closed
    // from the theme side (overlay tap, Esc, its own close button).
    useEffect(() => {
      const onMessage = (event: MessageEvent) => {
        const data = event.data as { type?: string; open?: boolean } | null;
        if (data?.type === 'dspln:menu-state') setMenuOpen(Boolean(data.open));
      };
      window.addEventListener('message', onMessage);
      return () => window.removeEventListener('message', onMessage);
    }, []);
    const downPosRef = useRef<{ x: number; y: number } | null>(null);

    const resolvedAnchors = useResolvedGiAnchors();

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
      // No markers on a removed part — its meshes are hidden, so squares
      // would float in empty space.
      if (!activePart || !partVisibility[activePart]) return [];
      return resolvedAnchors
        .filter(
          (anchor) =>
            anchor.part === activePart &&
            // Color dots are gone — the zone menu covers every color zone.
            // Only markers with no menu equivalent remain: logo placement
            // squares and the belt-end embroidery dots.
            (anchor.kind === 'kimono-logo' ||
              anchor.kind === 'pant-logo' ||
              anchor.kind === 'belt-end'),
        )
        .map((anchor) => anchorToMarker(anchor, filledIds));
    }, [activePart, filledIds, partVisibility, resolvedAnchors]);

    const handleRailTap = useCallback(
      (part: GiPart) => {
        dismissIntro();
        setActiveAnchor(null);
        setActivePart((prev) => {
          if (prev === part) {
            setCameraView(baseView);
            return null;
          }
          setCameraView(PART_CAMERA_VIEW[part]);
          return part;
        });
      },
      [baseView, dismissIntro, setCameraView],
    );

    // Intro choreography: beat 1 is the rail drop-in (pure CSS, ~0.9s),
    // beat 2 dims the screen with the hint, beat 3 opens the Kimono menu.
    useEffect(() => {
      if (!firstVisit) return;
      const dim = setTimeout(() => {
        if (!introDoneRef.current) setShowIntro(true);
      }, 1100);
      const openKimono = setTimeout(() => {
        if (!introDoneRef.current) {
          dismissIntro();
          handleRailTap('jacket');
        }
      }, 4600);
      const showCallouts = setTimeout(() => {
        if (!hintsCancelledRef.current) setShowHints(true);
      }, 5400);
      const hideCallouts = setTimeout(() => setShowHints(false), 12000);
      return () => {
        clearTimeout(dim);
        clearTimeout(openKimono);
        clearTimeout(showCallouts);
        clearTimeout(hideCallouts);
      };
    }, [dismissIntro, firstVisit, handleRailTap]);

    const handleMarkerSelect = useCallback(
      (marker: QuietMarker) => {
        const anchor = resolvedAnchors.find((item) => item.id === marker.id);
        if (!anchor) return;
        setActiveAnchor((prev) => {
          if (prev?.id === anchor.id) {
            if (activePart) setCameraView(PART_CAMERA_VIEW[activePart]);
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

    const handlePointerDown = useCallback((event: ReactPointerEvent) => {
      downPosRef.current = { x: event.clientX, y: event.clientY };
      // Any interaction clears (or pre-empts) the beat-4 callouts.
      hintsCancelledRef.current = true;
      setShowHints(false);
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
        if (
          (event.nativeEvent as unknown as Record<string, unknown>)
            .__dsplnMarkerTap
        ) {
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
      [activeAnchor, activePart, baseView, closePanel, setCameraView],
    );

    const total = serialize().price.total;

    return (
      <div
        className="dspln-v2-root relative h-[100dvh] min-h-[26rem] w-full overflow-hidden bg-white"
        onPointerDown={handlePointerDown}
        onClick={handleRootClick}
      >
        <style>{QUIET_HOTSPOT_STYLES + V5_EXTRA_STYLES}</style>

        {/* Header layer — sits UNDER the transparent canvas so the 3D model
            overlaps the wordmark as it moves (Vectary-style). A transparent
            click target ABOVE the canvas makes the logo navigate to the
            store's home page (the visual stays behind the model). */}
        <img
          src="/logos/dspln-wordmark-black.png"
          alt="DSPLN"
          draggable={false}
          className="pointer-events-none absolute top-5 left-1/2 z-0 w-[36%] max-w-[10.5rem] -translate-x-1/2 select-none"
        />
        <a
          aria-label="DSPLN home"
          href={(() => {
            const shop = new URLSearchParams(window.location.search).get('shop');
            return shop ? `https://${shop}/` : '/';
          })()}
          target={window.parent === window ? undefined : '_top'}
          className="absolute top-4 left-1/2 z-20 h-9 w-[36%] max-w-[10.5rem] -translate-x-1/2"
        />

        <GiCanvas
          className="gi-mobile-scroll-canvas relative z-10 h-full w-full touch-none"
          overlay={
            <QuietHotspotsLayer
              markers={markers}
              activeId={activeAnchor?.id ?? null}
              onSelect={handleMarkerSelect}
            />
          }
        />

        {/* First-visit onboarding: dim everything except the rail (which
            sits above this overlay), one line + arrow pointing at it. Any
            tap dismisses it forever. */}
        {showIntro ? (
          <button
            type="button"
            aria-label="Dismiss intro"
            onClick={() => {
              dismissIntro();
              handleRailTap('jacket');
            }}
            className="dspln-v5-intro-overlay absolute inset-0 z-[25] block h-full w-full cursor-default bg-black/45"
          >
            <span className="absolute bottom-28 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
              <span
                style={{ fontSize: '12px' }}
                className="font-semibold tracking-[0.16em] whitespace-nowrap text-white uppercase"
              >
                Tap a piece to customize
              </span>
              <span className="dspln-v5-intro-arrow text-xl text-white">↓</span>
            </span>
          </button>
        ) : null}

        {/* Beat-4 callouts: the two verbs, pointing at their targets. The
            overlay is pointer-transparent so the menu and squares stay live;
            it sits under the rail/menu (z-30) so they stay bright. */}
        {showHints ? (
          <div className="dspln-v5-intro-overlay pointer-events-none absolute inset-0 z-[25] bg-black/30">
            <div className="absolute top-[11%] left-1/2 flex -translate-x-1/2 flex-col items-center gap-1">
              <span
                style={{ fontSize: '10px' }}
                className="font-semibold tracking-[0.16em] whitespace-nowrap text-white uppercase"
              >
                Tap a square to place your logo
              </span>
              {/* Double-headed horizontal arrow — the squares flank it.
                  Dropped to sit level with the squares' centers. */}
              <span
                className="dspln-v5-intro-arrow mt-4 flex items-center text-white"
                aria-hidden="true"
              >
                <span className="text-lg leading-none">←</span>
                <span className="mx-1 h-px w-7 bg-white" />
                <span className="text-lg leading-none">→</span>
              </span>
            </div>
            <div className="absolute bottom-[21rem] left-1/2 flex -translate-x-1/2 flex-col items-center gap-1">
              <span
                style={{ fontSize: '10px' }}
                className="font-semibold tracking-[0.16em] whitespace-nowrap text-white uppercase"
              >
                Tap a swatch to change colors
              </span>
              <span className="dspln-v5-intro-arrow text-lg text-white">↓</span>
            </div>
          </div>
        ) : null}

        {/* ⊕ rail — horizontal, bottom center */}
        <div className="absolute bottom-4 left-1/2 z-30 flex -translate-x-1/2 flex-row items-end gap-6">
          {/* Everything for the open part docks ABOVE the rail, horizontally
              centered: the all-zones color menu by default, swapped for the
              hotspot panel (logo upload / belt embroidery) while one is
              active. Anchored to the whole rail so wide menus never hang
              off-screen. */}
          {activePart ? (
            <div className="absolute bottom-full left-1/2 z-30 mb-3 -translate-x-1/2">
              {activeAnchor ? (
                <GiAnchorPanel anchor={activeAnchor} onClose={closePanel} />
              ) : (
                <GiV5ZoneColorMenu part={activePart} />
              )}
            </div>
          ) : null}
          {RAIL_PARTS.map((part, index) => {
            const isActive = activePart === part;
            const included = partVisibility[part];
            return (
              <div
                key={part}
                className={`relative flex flex-col items-center gap-1 ${firstVisit ? 'dspln-v5-drop' : ''}`}
                style={firstVisit ? { animationDelay: `${0.2 + index * 0.18}s` } : undefined}
              >
                <button
                  type="button"
                  aria-label={
                    included
                      ? `Customize ${GI_PART_DISPLAY[part]}`
                      : `Add ${GI_PART_DISPLAY[part]} for $${GI_PART_PRICES[part]}`
                  }
                  aria-pressed={isActive}
                  // Ghost ⊕ = removed part; tapping just opens its menu —
                  // re-adding is the explicit Add toggle in there.
                  onClick={() => handleRailTap(part)}
                  className={`pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border transition ${
                    isActive
                      ? 'dspln-v5-plus is-active border-black bg-black text-white'
                      : included
                        ? 'dspln-v5-plus border-black/30 bg-white/30 text-black/70 backdrop-blur-md hover:border-black hover:text-black'
                        : 'border-dashed border-black/25 bg-white/10 text-black/30 backdrop-blur-md hover:border-black/60 hover:text-black/70'
                  }`}
                >
                  {isActive ? (
                    <X className="h-4 w-4" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </button>
                <span
                  className={`text-[8px] font-semibold uppercase tracking-[0.14em] whitespace-nowrap ${
                    isActive
                      ? 'text-black'
                      : included
                        ? 'text-black/40'
                        : 'text-black/30'
                  }`}
                >
                  {included
                    ? GI_PART_DISPLAY[part]
                    : `${GI_PART_DISPLAY[part]} · +$${GI_PART_PRICES[part]}`}
                </span>
              </div>
            );
          })}

        </div>

        {/* Bag — upper right, hidden while a part is being edited. Opens the
            order-summary drawer; the drawer's full-width button commits. */}
        {!activePart ? (
          <div className="absolute top-4 right-4 z-40 flex flex-col items-center gap-1">
            <button
              type="button"
              aria-label={`Review order — $${total}`}
              onClick={() => setCartDrawerOpen(true)}
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white shadow-[0_4px_16px_rgba(0,0,0,0.15)] transition hover:bg-black"
            >
              <ShoppingBag className="h-5 w-5" />
            </button>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/45">
              {isAddingToCart ? '…' : `$${total}`}
            </span>
          </div>
        ) : null}

        {/* Design assistant — floating AI bubble, bottom right */}
        {showAssistant ? (
          <>
            <button
              type="button"
              aria-label="Open design assistant"
              onClick={() => setAssistantSignal((n) => n + 1)}
              className="absolute bottom-6 left-4 z-40 h-12 w-12 transition hover:scale-110"
            >
              <AssistantBubbleIcon className="h-full w-full drop-shadow-[0_4px_12px_rgba(0,0,0,0.25)]" />
            </button>
            <DesignAssistant
              placement="mobile"
              hideLauncher
              openSignal={assistantSignal}
            />
          </>
        ) : null}

        {/* Order summary drawer */}
        <GiV5CartDrawer
          open={cartDrawerOpen}
          onClose={() => setCartDrawerOpen(false)}
          onAddToCart={onAddToCart}
          isAddingToCart={Boolean(isAddingToCart)}
          cartActionLabel={cartActionLabel}
          cartActionLoadingLabel={cartActionLoadingLabel}
        />

        {/* Hamburger — toggles the Shopify theme's main menu drawer (via the
            cart-bridge postMessage listener), showing an X while the drawer
            is open. Plain navigation fallback when the app runs standalone. */}
        <button
          type="button"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => {
            if (window.parent !== window) {
              window.parent.postMessage(
                { type: menuOpen ? 'dspln:close-menu' : 'dspln:open-menu' },
                '*',
              );
              setMenuOpen((prev) => !prev);
            } else {
              window.location.href = '/';
            }
          }}
          className="absolute top-2 left-2 z-40 flex h-11 w-11 items-center justify-center text-black/45 transition hover:text-black"
        >
          {menuOpen ? (
            <X className="h-7 w-7" />
          ) : (
            <MenuIcon className="h-7 w-7" />
          )}
        </button>


      </div>
    );
  },
);

GiV5Shell.displayName = 'GiV5Shell';
