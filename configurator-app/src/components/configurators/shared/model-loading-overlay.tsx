import { memo, useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';

/**
 * Full-canvas loading state for the 3D configurators.
 *
 * Replaces the old small pill, which used <Html center> — that centres on the
 * 3D *origin*, so with an offset camera it drifted off-screen and a first-time
 * visitor saw an apparently empty page and could bounce before the GLB landed.
 *
 * This renders as a normal DOM sibling of the <Canvas> (the wrapper is
 * `relative`), so it is genuinely centred, and it gives the visitor three
 * things immediately: the garment's shape, real progress, and something useful
 * to read while waiting.
 *
 * useProgress is drei's global loading-manager store, so it works outside the
 * Canvas tree.
 */

const DEFAULT_TIPS = [
  'Drag to spin the garment — scroll or pinch to zoom in',
  'Tap any panel to change its colour',
  'Upload your academy logo and place it anywhere',
  'Use the view buttons to jump to front, back or sleeve',
  'Your design saves automatically — pick it up later',
  'Every order ships with a full production tech pack',
];

const TIP_INTERVAL_MS = 2800;
/** Long enough for the cross-fade to finish before the overlay unmounts. */
const FADE_MS = 450;

/** A simple gi silhouette: shows the shape of the product before it renders. */
function GarmentGhost({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 150"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      {/* jacket */}
      <path
        d="M40 26 L26 33 L14 48 L24 57 L32 48 L32 92 L88 92 L88 48 L96 57 L106 48 L94 33 L80 26 L60 44 Z"
        fill="currentColor"
      />
      {/* lapel */}
      <path d="M40 26 L60 44 L80 26 L60 34 Z" fill="currentColor" opacity="0.55" />
      {/* pants */}
      <path
        d="M34 96 L86 96 L82 140 L64 140 L60 108 L56 140 L38 140 Z"
        fill="currentColor"
        opacity="0.85"
      />
    </svg>
  );
}

export const ModelLoadingOverlay = memo(
  ({ tips = DEFAULT_TIPS, label = 'Building your 3D preview' }: {
    tips?: string[];
    label?: string;
  }) => {
    const { progress, active } = useProgress();
    const [tipIndex, setTipIndex] = useState(0);
    const [visible, setVisible] = useState(true);
    const [mounted, setMounted] = useState(true);

    // Never show 0% (reads as broken) or 100% before the model appears.
    const shown = Math.max(2, Math.min(99, Math.round(progress || 2)));

    useEffect(() => {
      if (tips.length < 2) return;
      const timer = window.setInterval(
        () => setTipIndex((current) => (current + 1) % tips.length),
        TIP_INTERVAL_MS,
      );
      return () => window.clearInterval(timer);
    }, [tips.length]);

    // Cross-fade out once loading finishes, then stop rendering entirely so the
    // overlay can never intercept a pointer event on the live model.
    useEffect(() => {
      if (active) return;
      const fade = window.setTimeout(() => setVisible(false), 120);
      const unmount = window.setTimeout(() => setMounted(false), 120 + FADE_MS);
      return () => {
        window.clearTimeout(fade);
        window.clearTimeout(unmount);
      };
    }, [active]);

    if (!mounted) return null;

    return (
      <div
        className={`pointer-events-none absolute inset-0 z-20 flex select-none flex-col items-center justify-center bg-white transition-opacity duration-[450ms] ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        role="status"
        aria-live="polite"
      >
        <GarmentGhost className="h-40 w-32 animate-pulse text-[#ececec] sm:h-48 sm:w-40" />

        <p className="mt-7 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#9a9a9a]">
          {label}
        </p>

        <div className="mt-4 h-[3px] w-52 overflow-hidden rounded-full bg-[#ededed] sm:w-64">
          <div
            className="h-full rounded-full bg-[#5d0909] transition-[width] duration-300 ease-out"
            style={{ width: `${shown}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] font-semibold tabular-nums text-[#1c1b1b]">
          {shown}%
        </p>

        {/* Keyed so each tip fades in rather than snapping. */}
        <p
          key={tipIndex}
          className="mt-8 max-w-[19rem] animate-[dsplnLoaderFadeIn_400ms_ease-out] px-6 text-center text-[13px] leading-relaxed text-[#6b6b6b]"
        >
          {tips[tipIndex]}
        </p>
      </div>
    );
  },
);

ModelLoadingOverlay.displayName = 'ModelLoadingOverlay';
