import { memo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';

interface CameraRigProps {
  target: [number, number, number];
  position: [number, number, number];
  lerpSpeed?: number;
}

/**
 * Animates the camera toward `position` (looking at `target`).
 * Drop inside a <Canvas>; works alongside <OrbitControls>.
 */
export const CameraRig = memo(
  ({ target, position, lerpSpeed = 4 }: CameraRigProps) => {
    const { camera } = useThree();
    const desiredPos = useRef(new Vector3(...position));
    const desiredTarget = useRef(new Vector3(...target));

    desiredPos.current.set(...position);
    desiredTarget.current.set(...target);

    useFrame((_, delta) => {
      const alpha = Math.min(1, delta * lerpSpeed);
      camera.position.lerp(desiredPos.current, alpha);
      camera.lookAt(desiredTarget.current);
      camera.updateProjectionMatrix();
    });

    return null;
  },
);

CameraRig.displayName = 'CameraRig';
