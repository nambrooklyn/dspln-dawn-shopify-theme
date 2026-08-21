import { memo, useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  DoubleSide,
  Raycaster,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
} from 'three';

import type { PantLogoSlot } from '../kids-gi/gi-config';
import { useGiState } from '../kids-gi/gi-state';
import { ProjectedDecal } from '../shared/projected-decal';

/**
 * Quiet half-size hotspot markers shared by the v3 (two-level) and v4
 * (mode-toggle) shells. Compared to the v2 markers: 10px dots / 20px squares,
 * lower idle contrast, and a staggered pulse so the scene never throbs in
 * unison. Generic — a marker is just a labelled point; the shells decide what
 * a tap means.
 */
export interface QuietMarker {
  id: string;
  label: string;
  position: [number, number, number];
  facing: [number, number, number];
  /** dashed logo square instead of a colour dot */
  square?: boolean;
  /** square already has a logo — solid ✓ */
  filled?: boolean;
  /** tiny label rendered under the dot (e.g. "Tap to add text") */
  caption?: string;
  /** print footprint on the fabric — squares with this render as a plane
   *  lying ON the garment (true position, tilt, and logo size) instead of a
   *  camera-facing billboard */
  plane?: {
    position: [number, number, number];
    rotation: [number, number, number];
    sizeIn: { w: number; h: number };
  };
}

export const QUIET_HOTSPOT_STYLES = `
/* Camera arrows: the SAME frosted glass as the options menu / add-to-cart /
   rail buttons (v1 ships them solid white). Overridden here rather than in
   the v1 component; only one shell's canvas exists per page. */
div[aria-label="Move model vertically"] {
  background: rgba(255, 255, 255, 0.25) !important;
  border: 1px solid rgba(255, 255, 255, 0.3) !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12) !important;
  backdrop-filter: blur(40px) saturate(1.5);
  -webkit-backdrop-filter: blur(40px) saturate(1.5);
}
div[aria-label="Move model vertically"] button {
  border: none !important;
  background: transparent;
}
/* hover only where a real pointer exists — touch browsers (Android
   Chrome) otherwise leave the tapped button stuck black. :active still
   gives tap feedback everywhere and releases correctly. */
@media (hover: hover) {
  div[aria-label="Move model vertically"] button:hover {
    background: rgba(0, 0, 0, 0.85);
  }
}
div[aria-label="Move model vertically"] button:active {
  background: rgba(0, 0, 0, 0.85);
}
@keyframes dspln-v3-pulse {
  0% { box-shadow: 0 0 0 0 rgba(0, 0, 0, 0.22); }
  70% { box-shadow: 0 0 0 7px rgba(0, 0, 0, 0); }
  100% { box-shadow: 0 0 0 0 rgba(0, 0, 0, 0); }
}
/* Dots (belt embroidery in v5): VERY obvious pulse — the dot throbs in size
   while a white-then-black double ring expands, so it reads on any fabric. */
@keyframes dspln-v3-dot-pulse {
  0% {
    transform: scale(1);
    box-shadow:
      0 0 0 0 rgba(255, 255, 255, 0.95),
      0 0 0 0 rgba(0, 0, 0, 0.55);
  }
  45% {
    transform: scale(1.45);
  }
  80% {
    box-shadow:
      0 0 0 9px rgba(255, 255, 255, 0),
      0 0 0 18px rgba(0, 0, 0, 0);
  }
  100% {
    transform: scale(1);
    box-shadow:
      0 0 0 0 rgba(255, 255, 255, 0),
      0 0 0 0 rgba(0, 0, 0, 0);
  }
}
.dspln-v3-hotspot-dot {
  width: 11px;
  height: 11px;
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.9);
  border: 1.5px solid rgba(255, 255, 255, 0.9);
  animation: dspln-v3-dot-pulse 1.1s ease-out infinite;
  transition: transform 140ms ease;
  cursor: pointer;
}
.dspln-v3-hotspot-dot:hover,
.dspln-v3-hotspot-dot.is-active {
  transform: scale(1.6);
  animation: none;
}
.dspln-v3-hotspot-dot.is-part {
  width: 15px;
  height: 15px;
  border-width: 2px;
}
.dspln-v3-hotspot-square {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.14);
  border: 1px dashed rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: dspln-v3-pulse 2.6s ease-out infinite;
  transition: transform 140ms ease, background 140ms ease;
  cursor: pointer;
}
.dspln-v3-hotspot-square:hover,
.dspln-v3-hotspot-square.is-active {
  transform: scale(1.2);
  background: rgba(255, 255, 255, 0.7);
  animation: none;
}
.dspln-v3-hotspot-square.is-filled {
  border-style: solid;
  background: rgba(255, 255, 255, 0.85);
  animation: none;
}
.dspln-v3-hotspot-caption {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-top: 7px;
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  white-space: nowrap;
  color: #fff;
  text-shadow:
    0 0 3px rgba(0, 0, 0, 0.9),
    0 1px 2px rgba(0, 0, 0, 0.9);
  pointer-events: none;
}
.dspln-v3-hotspot-plus {
  font-size: 11px;
  line-height: 1;
  font-weight: 500;
  color: rgba(0, 0, 0, 0.6);
}
`;

// 1 "inch" of print area ≈ 0.1 world unit (same convention as LayerDecal).
const WORLD_UNITS_PER_INCH = 0.1;
// Dashed (or solid, when filled) rounded square with a +/✓ glyph, rendered to
// a data URL for ProjectedDecal. Ink is baked at FULL strength — the live
// opacity (idle pulse / active / dimmed) is driven on the decal material
// every frame, which multiplies with the texture alpha.
function squareTextureUrl(aspect: number, filled: boolean, alpha: number) {
  const W = 512;
  const H = Math.max(128, Math.round(W / aspect));
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  if (!ctx) return '';

  // Mid-gray ink, not black: a 50%-alpha BLACK stroke over white fabric
  // still reads as solid dark paint (verified pixel-exact — the alpha works,
  // the eye just can't see it). Lighter ink + thinner line is what makes the
  // outline READ as translucent.
  // Dual-stroke so the outline is legible on ANY fabric color: a white core
  // line inside a black halo — dark cloth shows the white, light cloth shows
  // the black.
  const line = 6;
  const halo = 13;
  const pad = halo + 4;
  const radius = 40;
  const drawSquare = (width: number, style: string) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    if (!filled) ctx.setLineDash([44, 30]);
    ctx.beginPath();
    ctx.roundRect(pad, pad, W - pad * 2, H - pad * 2, radius);
    ctx.stroke();
  };
  drawSquare(halo, `rgba(0, 0, 0, ${alpha})`);
  drawSquare(line, `rgba(255, 255, 255, ${alpha})`);

  ctx.setLineDash([]);
  ctx.font = `${Math.round(Math.min(W, H) * 0.34)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Same halo treatment on the glyph.
  ctx.lineWidth = 7;
  ctx.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.strokeText(filled ? '✓' : '+', W / 2, H / 2);
  ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, alpha + 0.1)})`;
  ctx.fillText(filled ? '✓' : '+', W / 2, H / 2);

  return cv.toDataURL('image/png');
}

/**
 * A logo-slot marker WRAPPED onto the garment via the same DecalGeometry
 * projection the real logo decals use — a flat plane can only approximate a
 * curved chest/sleeve, so the outline projects onto the actual mesh surface
 * instead. An invisible plane at the anchor is the tap target (DecalGeometry
 * raycasting is unreliable; a simple quad is not).
 */
const FabricSquare = memo(
  ({
    marker,
    index,
    active,
    dimmed,
    onSelect,
  }: {
    marker: QuietMarker;
    index: number;
    active: boolean;
    dimmed: boolean;
    onSelect: (marker: QuietMarker) => void;
  }) => {
    const plane = marker.plane!;
    const { kimonoBodyMesh, kimonoLogoMeshes, pantLogoMeshes } = useGiState();
    const decalGroupRef = useRef<Group>(null);

    const imageUrl = useMemo(
      () =>
        squareTextureUrl(
          plane.sizeIn.w / plane.sizeIn.h,
          Boolean(marker.filled),
          1,
        ),
      [marker.filled, plane.sizeIn.h, plane.sizeIn.w],
    );

    // Live opacity on the decal material: idle squares breathe (a clear
    // pulse between ~30% and full), steady when active/dimmed. Staggered per
    // marker so they ripple. A FILLED slot hides its outline — the logo
    // itself marks the spot (a frame around the artwork looked odd); it
    // re-appears only while that slot is selected.
    useFrame(({ clock }) => {
      const group = decalGroupRef.current;
      if (!group) return;
      const target = marker.filled
        ? active
          ? 0.6
          : 0
        : dimmed
          ? 0.15
          : active
            ? 1
            : 0.65 + Math.sin(clock.elapsedTime * 5.5 + index * 1.3) * 0.35;
      group.traverse((child) => {
        const material = (child as Mesh).material as MeshBasicMaterial;
        if (material?.map) material.opacity = target;
      });
    });

    // Same projection targets the real logo decals use (see gi-canvas):
    // chest/sleeves → dedicated logo meshes (body fallback), back → body
    // mesh, thighs → the per-slot pant mesh. Unlike a solid logo, a 50%
    // outline must project onto exactly ONE mesh — overlapping meshes each
    // draw the stroke and the alphas stack (50% + 50% → 75%, "too dark").
    // Raycast from the anchor to find the mesh actually under it.
    const isPant = marker.id.startsWith('pant-logo-');
    const isBack = marker.id === 'kimono-logo-back';
    const targetMesh = useMemo(() => {
      if (isPant) {
        const slot = marker.id.replace('pant-logo-', '') as PantLogoSlot;
        return pantLogoMeshes[slot] ?? null;
      }
      if (isBack) return kimonoBodyMesh;
      const candidates =
        kimonoLogoMeshes.length > 0
          ? kimonoLogoMeshes
          : kimonoBodyMesh
            ? [kimonoBodyMesh]
            : [];
      if (candidates.length <= 1) return candidates[0] ?? null;
      const outward = new Vector3(...marker.facing).normalize();
      const origin = new Vector3(...plane.position).addScaledVector(
        outward,
        0.5,
      );
      const raycaster = new Raycaster(origin, outward.clone().negate(), 0, 2);
      let best: { mesh: (typeof candidates)[number]; distance: number } | null =
        null;
      for (const candidate of candidates) {
        candidate.updateWorldMatrix(true, false);
        const hit = raycaster.intersectObject(candidate, false)[0];
        if (hit && (!best || hit.distance < best.distance)) {
          best = { mesh: candidate, distance: hit.distance };
        }
      }
      return best?.mesh ?? candidates[0];
    }, [
      isBack,
      isPant,
      kimonoBodyMesh,
      kimonoLogoMeshes,
      marker.facing,
      marker.id,
      pantLogoMeshes,
      plane.position,
    ]);

    const width = plane.sizeIn.w * WORLD_UNITS_PER_INCH;
    const height = plane.sizeIn.h * WORLD_UNITS_PER_INCH;

    const handleClick = (event: ThreeEvent<MouseEvent>) => {
      if (dimmed) return;
      event.stopPropagation();
      // The DOM click still bubbles to the shell's background-tap handler —
      // flag it so opening a slot doesn't instantly count as a background tap.
      (event.nativeEvent as unknown as Record<string, unknown>).__dsplnMarkerTap =
        true;
      onSelect(marker);
    };

    return (
      <>
        {targetMesh ? (
          <group ref={decalGroupRef}>
            <ProjectedDecal
              key={`${marker.id}-${targetMesh.uuid}`}
              mesh={targetMesh}
              imageUrl={imageUrl}
              position={plane.position}
              rotation={plane.rotation}
              widthWorld={width}
              heightWorld={height}
              depthWorld={isBack ? 0.4 : isPant ? 0.32 : 0.2}
              // A thin outline shows every clip a solid logo image hides —
              // float it well above the seam ridges (still <3mm at real scale).
              surfaceOffsetWorld={0.024}
              polygonOffsetFactor={-24}
              polygonOffsetUnits={-24}
              surfaceIsland="frontmost"
            />
          </group>
        ) : null}
        {/* Invisible tap target at the anchor */}
        <group position={plane.position} rotation={plane.rotation}>
          <mesh position={[0, 0, 0.02]} onClick={handleClick}>
            <planeGeometry args={[width, height]} />
            <meshBasicMaterial
              transparent
              opacity={0}
              depthWrite={false}
              side={DoubleSide}
            />
          </mesh>
        </group>
      </>
    );
  },
);
FabricSquare.displayName = 'FabricSquare';

const QuietHotspot = memo(
  ({
    marker,
    index,
    active,
    dimmed,
    isPart,
    onSelect,
  }: {
    marker: QuietMarker;
    index: number;
    active: boolean;
    dimmed: boolean;
    /** part-level dots render slightly larger than option dots */
    isPart?: boolean;
    onSelect: (marker: QuietMarker) => void;
  }) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const { camera } = useThree();
    const facing = useRef(new Vector3(...marker.facing).normalize()).current;
    const toCamera = useRef(new Vector3()).current;

    useFrame(() => {
      const el = wrapperRef.current;
      if (!el) return;
      toCamera
        .copy(camera.position)
        .sub(new Vector3(...marker.position))
        .normalize();
      const dot = toCamera.dot(facing);
      const visibility = Math.min(1, Math.max(0, (dot - 0.08) / 0.3));
      // Black dots run near-full strength — they're the discovery cue.
      const opacity = visibility * (dimmed ? 0.2 : 0.92);
      el.style.opacity = String(active ? visibility : opacity);
      el.style.pointerEvents = visibility > 0.4 && !dimmed ? 'auto' : 'none';
    });

    return (
      <Html
        position={marker.position}
        center
        zIndexRange={[30, 10]}
        style={{ pointerEvents: 'none' }}
      >
        <div
          ref={wrapperRef}
          style={{ position: 'relative', transition: 'opacity 120ms linear' }}
        >
          <button
            type="button"
            aria-label={marker.label}
            title={marker.label}
            style={{ animationDelay: `${(index % 5) * 0.4}s` }}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(marker);
            }}
            className={
              marker.square
                ? `dspln-v3-hotspot-square${active ? ' is-active' : ''}${marker.filled ? ' is-filled' : ''}`
                : `dspln-v3-hotspot-dot${active ? ' is-active' : ''}${isPart ? ' is-part' : ''}`
            }
          >
            {marker.square ? (
              <span aria-hidden="true" className="dspln-v3-hotspot-plus">
                {marker.filled ? '✓' : '+'}
              </span>
            ) : null}
          </button>
          {marker.caption ? (
            <span className="dspln-v3-hotspot-caption" aria-hidden="true">
              {marker.caption}
            </span>
          ) : null}
        </div>
      </Html>
    );
  },
);
QuietHotspot.displayName = 'QuietHotspot';

export const QuietHotspotsLayer = memo(
  ({
    markers,
    activeId,
    isPartLevel,
    onSelect,
  }: {
    markers: QuietMarker[];
    activeId: string | null;
    /** renders every marker in the slightly-larger part-dot style */
    isPartLevel?: boolean;
    onSelect: (marker: QuietMarker) => void;
  }) => (
    <>
      {markers.map((marker, index) =>
        marker.square && marker.plane ? (
          <FabricSquare
            key={marker.id}
            marker={marker}
            index={index}
            active={marker.id === activeId}
            dimmed={activeId !== null && marker.id !== activeId}
            onSelect={onSelect}
          />
        ) : (
          <QuietHotspot
            key={marker.id}
            marker={marker}
            index={index}
            active={marker.id === activeId}
            dimmed={activeId !== null && marker.id !== activeId}
            isPart={isPartLevel}
            onSelect={onSelect}
          />
        ),
      )}
    </>
  ),
);
QuietHotspotsLayer.displayName = 'QuietHotspotsLayer';
