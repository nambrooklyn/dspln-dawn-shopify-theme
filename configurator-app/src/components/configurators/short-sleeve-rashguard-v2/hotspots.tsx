import { memo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Mesh,
  Raycaster,
  Vector2,
  Vector3,
  type Object3D,
  type Scene as ThreeScene,
} from 'three';

import {
  RASHGUARD_MESH_TO_PART,
  type RashguardPart,
} from '../short-sleeve-rashguard/rashguard-config';
import type { V2HotspotAnchor } from './anchors';

export type V2HotspotSelection =
  | { kind: 'color'; anchor: V2HotspotAnchor }
  | { kind: 'logo'; anchor: V2HotspotAnchor };

/**
 * Compute the normalized 0-1 artwork point where a world-space anchor lands on
 * a target mesh — used to drop an uploaded logo exactly at the pulsing square
 * the customer tapped. Mirrors normalizedPointFromUv in the v1 glb model
 * (layer x/y are normalized within the mesh's own UV bounds, not raw UVs).
 */
function normalizedMeshName(name: string | undefined | null) {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Mesh name → part, same table the glb model colours by. Matched loosely so
// 'Front_3.001' still resolves to 'front'.
const NORMALIZED_MESH_TO_PART = new Map<string, RashguardPart>(
  Object.entries(RASHGUARD_MESH_TO_PART).map(([name, part]) => [
    normalizedMeshName(name),
    part,
  ]),
);

function partForMeshName(mesh: Mesh): RashguardPart | null {
  const candidates = [
    mesh.name,
    mesh.geometry?.name,
    mesh.parent?.name,
    mesh.parent?.parent?.name,
  ];
  for (const candidate of candidates) {
    const normalized = normalizedMeshName(candidate);
    if (!normalized) continue;
    const direct = NORMALIZED_MESH_TO_PART.get(normalized);
    if (direct) return direct;
    for (const [key, part] of NORMALIZED_MESH_TO_PART) {
      if (normalized.startsWith(key) || key.startsWith(normalized)) return part;
    }
  }
  return null;
}

function normalizedUvPoint(mesh: Mesh, uv: Vector2) {
  const uvAttr = mesh.geometry.attributes.uv;
  if (!uvAttr || uvAttr.count <= 0) return { x: uv.x, y: uv.y };
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  for (let i = 0; i < uvAttr.count; i++) {
    const u = uvAttr.getX(i);
    const v = uvAttr.getY(i);
    minU = Math.min(minU, u);
    minV = Math.min(minV, v);
    maxU = Math.max(maxU, u);
    maxV = Math.max(maxV, v);
  }
  const width = maxU - minU || 1;
  const height = maxV - minV || 1;
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return {
    x: clamp((uv.x - minU) / width),
    y: clamp((uv.y - minV) / height),
  };
}

/**
 * Where does a hotspot anchor land on the garment, in layer coordinates?
 * Casts inward from the anchor and takes the first hit belonging to the
 * target part, then normalizes the hit UV within that mesh's UV bounds —
 * the same math a real placement tap runs (normalizedPointFromUv in the v1
 * glb model). This model has no dedicated "Target Mesh" objects, so we
 * raycast the visible panel meshes and match them by name → part.
 */
export function uvPointForAnchorOnScene(
  scene: ThreeScene | null,
  anchor: V2HotspotAnchor,
  targetPart: RashguardPart,
): { x: number; y: number } | null {
  const garment: Object3D | null =
    scene?.getObjectByName('rashguard-garment') ?? scene ?? null;
  if (!garment) return null;

  const outward = new Vector3(...anchor.facing).normalize();
  const origin = new Vector3(...anchor.position).addScaledVector(outward, 0.6);
  const raycaster = new Raycaster(origin, outward.clone().negate(), 0, 3);
  garment.updateWorldMatrix(true, true);

  for (const hit of raycaster.intersectObject(garment, true)) {
    const mesh = hit.object as Mesh;
    if (!mesh.isMesh || !hit.uv) continue;
    if (mesh.userData.rashguardStitchingOverlay) continue;
    if (partForMeshName(mesh) !== targetPart) continue;
    return normalizedUvPoint(mesh, hit.uv);
  }
  return null;
}

/**
 * One camera-facing hotspot. Fades away when the camera orbits behind the
 * surface it is pinned to (cheap dot-product test instead of occlusion rays).
 */
const V2Hotspot = memo(
  ({
    anchor,
    active,
    dimmed,
    onSelect,
  }: {
    anchor: V2HotspotAnchor;
    active: boolean;
    dimmed: boolean;
    onSelect: (anchor: V2HotspotAnchor) => void;
  }) => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const { camera } = useThree();
    const facing = useRef(new Vector3(...anchor.facing).normalize()).current;
    const toCamera = useRef(new Vector3()).current;

    useFrame(() => {
      const el = wrapperRef.current;
      if (!el) return;
      toCamera
        .copy(camera.position)
        .sub(new Vector3(...anchor.position))
        .normalize();
      const dot = toCamera.dot(facing);
      // Fully visible facing the camera; gone once the surface turns away.
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
              anchor.kind === 'color'
                ? `dspln-v2-hotspot-dot${active ? ' is-active' : ''}`
                : `dspln-v2-hotspot-square${active ? ' is-active' : ''}`
            }
          >
            {anchor.kind === 'logo' ? (
              <span aria-hidden="true" className="dspln-v2-hotspot-plus">
                +
              </span>
            ) : null}
          </button>
        </div>
      </Html>
    );
  },
);
V2Hotspot.displayName = 'V2Hotspot';

export const V2HotspotsLayer = memo(
  ({
    anchors,
    activeId,
    visible,
    onSelect,
  }: {
    anchors: V2HotspotAnchor[];
    activeId: string | null;
    visible: boolean;
    onSelect: (anchor: V2HotspotAnchor) => void;
  }) => {
    if (!visible) return null;
    return (
      <>
        {anchors.map((anchor) => (
          <V2Hotspot
            key={anchor.id}
            anchor={anchor}
            active={anchor.id === activeId}
            dimmed={activeId !== null && anchor.id !== activeId}
            onSelect={onSelect}
          />
        ))}
      </>
    );
  },
);
V2HotspotsLayer.displayName = 'V2HotspotsLayer';
