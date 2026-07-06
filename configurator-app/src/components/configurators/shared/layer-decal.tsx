import { memo, useEffect, useMemo, useState } from 'react';
import { DoubleSide, TextureLoader, type Texture } from 'three';

interface LayerDecalProps {
  imageUrl: string;
  position: [number, number, number];
  /** Optional plane orientation (Euler XYZ in radians). Default [0,0,0]
   *  means the plane faces +Z. Pass [0, Math.PI, 0] for a back-facing
   *  plane, [0, Math.PI/2, 0] for a +X-facing plane (sleeve), etc. */
  rotation?: [number, number, number];
  /** Where the surface normal points — used to push the plane a touch
   *  off the underlying mesh so it doesn't z-fight. */
  normal: [number, number, number];
  widthIn: number;
  heightIn: number;
  /** Extra spin (degrees) AROUND the plane's normal, applied on top of
   *  the orientation rotation. Lets the user rotate a placed logo. */
  rotateDeg?: number;
  scalePct?: number;
  surfaceOffsetWorld?: number;
  depthTest?: boolean;
  visible?: boolean;
  selected?: boolean;
  onPointerDown?: () => void;
}

// Convert print-area inches to local world units. The gi auto-scales
// to ~2.5 units tall, so 1 in ≈ 0.1 world unit feels roughly correct
// for placement sizing.
const IN_TO_WORLD = 1 / 10;

/**
 * Textured plane anchored to a 3D position on the gi surface.
 * Positions itself + a small normal offset so it doesn't z-fight.
 * `rotation` orients the plane (so it faces outward from the body),
 * `rotateDeg` adds a user-controllable spin around the plane's normal.
 */
export const LayerDecal = memo(
  ({
    imageUrl,
    position,
    rotation = [0, 0, 0],
    normal,
    widthIn,
    heightIn,
    rotateDeg = 0,
    scalePct = 100,
    surfaceOffsetWorld = 0.003,
    depthTest = true,
    visible = true,
    selected = false,
    onPointerDown,
  }: LayerDecalProps) => {
    const [texture, setTexture] = useState<Texture | null>(null);

    useEffect(() => {
      let cancelled = false;
      const loader = new TextureLoader();
      loader.load(
        imageUrl,
        (tex) => {
          if (cancelled) {
            tex.dispose();
            return;
          }
          setTexture(tex);
        },
        undefined,
        () => {
          if (!cancelled) setTexture(null);
        },
      );
      return () => {
        cancelled = true;
        setTexture((prev) => {
          prev?.dispose();
          return null;
        });
      };
    }, [imageUrl]);

    // Compose the plane orientation (from anchor) with the user spin
    // (rotateDeg) around the plane's own Z axis.
    const composedRotation = useMemo<[number, number, number]>(() => {
      const radZ = (rotateDeg * Math.PI) / 180;
      return [rotation[0], rotation[1], rotation[2] + radZ];
    }, [rotation, rotateDeg]);

    const scaleFactor = (scalePct ?? 100) / 100;
    const w = widthIn * IN_TO_WORLD * scaleFactor;
    const h = heightIn * IN_TO_WORLD * scaleFactor;

    // Push slightly along the normal so the plane doesn't z-fight the gi mesh.
    const offsetPosition: [number, number, number] = [
      position[0] + normal[0] * surfaceOffsetWorld,
      position[1] + normal[1] * surfaceOffsetWorld,
      position[2] + normal[2] * surfaceOffsetWorld,
    ];

    if (!visible || !texture) return null;

    return (
      <mesh
        position={offsetPosition}
        rotation={composedRotation}
        renderOrder={10}
        frustumCulled={false}
        onPointerDown={(e) => {
          e.stopPropagation();
          onPointerDown?.();
        }}
      >
        <planeGeometry args={[Math.max(w, 0.01), Math.max(h, 0.01)]} />
        <meshBasicMaterial
          map={texture}
          transparent
          depthTest={depthTest}
          depthWrite={false}
          toneMapped={false}
          side={DoubleSide}
        />
        {selected ? (
          <mesh>
            <planeGeometry
              args={[Math.max(w, 0.01) * 1.05, Math.max(h, 0.01) * 1.05]}
            />
            <meshBasicMaterial
              color="#be5c23"
              transparent
              opacity={0.25}
              depthWrite={false}
            />
          </mesh>
        ) : null}
      </mesh>
    );
  },
);

LayerDecal.displayName = 'LayerDecal';
