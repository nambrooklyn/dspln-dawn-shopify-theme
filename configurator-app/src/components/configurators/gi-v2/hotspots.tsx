import { memo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';

import type { GiV2Anchor } from './anchors';

/**
 * Camera-facing hotspot markers pinned to 3D points on the gi. Same visual
 * language as the rashguard v2: pulsing circles (colours / embroidery) and
 * dashed squares (logo slots). A hotspot fades out when the camera orbits
 * behind the surface it sits on (dot-product test — far cheaper than
 * per-frame occlusion raycasts on the full gi mesh).
 */
const GiV2Hotspot = memo(
  ({
    anchor,
    active,
    dimmed,
    filled,
    onSelect,
  }: {
    anchor: GiV2Anchor;
    active: boolean;
    dimmed: boolean;
    /** logo squares render solid when the slot already has a logo */
    filled?: boolean;
    onSelect: (anchor: GiV2Anchor) => void;
  }) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const { camera } = useThree();
    const facing = useRef(new Vector3(...anchor.facing).normalize()).current;
    const toCamera = useRef(new Vector3()).current;
    const isSquare = anchor.kind === 'kimono-logo' || anchor.kind === 'pant-logo';

    useFrame(() => {
      const el = wrapperRef.current;
      if (!el) return;
      toCamera
        .copy(camera.position)
        .sub(new Vector3(...anchor.position))
        .normalize();
      const dot = toCamera.dot(facing);
      const visibility = Math.min(1, Math.max(0, (dot - 0.08) / 0.3));
      const opacity = visibility * (dimmed ? 0.25 : 1);
      el.style.opacity = String(opacity);
      el.style.pointerEvents = visibility > 0.4 && !dimmed ? 'auto' : 'none';
    });

    return (
      <Html
        position={anchor.position}
        center
        zIndexRange={[30, 10]}
        style={{ pointerEvents: 'none' }}
      >
        <div ref={wrapperRef} style={{ transition: 'opacity 120ms linear' }}>
          <button
            type="button"
            aria-label={anchor.label}
            title={anchor.label}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(anchor);
            }}
            className={
              isSquare
                ? `dspln-v2-hotspot-square${active ? ' is-active' : ''}${filled ? ' is-filled' : ''}`
                : `dspln-v2-hotspot-dot${active ? ' is-active' : ''}`
            }
          >
            {isSquare ? (
              <span aria-hidden="true" className="dspln-v2-hotspot-plus">
                {filled ? '✓' : '+'}
              </span>
            ) : null}
          </button>
        </div>
      </Html>
    );
  },
);
GiV2Hotspot.displayName = 'GiV2Hotspot';

export const GiV2HotspotsLayer = memo(
  ({
    anchors,
    activeId,
    visible,
    filledIds,
    onSelect,
  }: {
    anchors: GiV2Anchor[];
    activeId: string | null;
    visible: boolean;
    filledIds: Set<string>;
    onSelect: (anchor: GiV2Anchor) => void;
  }) => {
    if (!visible) return null;
    return (
      <>
        {anchors.map((anchor) => (
          <GiV2Hotspot
            key={anchor.id}
            anchor={anchor}
            active={anchor.id === activeId}
            dimmed={activeId !== null && anchor.id !== activeId}
            filled={filledIds.has(anchor.id)}
            onSelect={onSelect}
          />
        ))}
      </>
    );
  },
);
GiV2HotspotsLayer.displayName = 'GiV2HotspotsLayer';
