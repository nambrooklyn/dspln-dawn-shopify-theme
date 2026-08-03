import { useCallback, useEffect, type MutableRefObject } from 'react';
import { useThree } from '@react-three/fiber';
import { Vector3 } from 'three';

export const CAMERA_VERTICAL_PAN_EVENT = 'dspln:configurator-camera:pan';

type CameraPanAction = 'up' | 'down' | 'center';

interface OrbitControlsLike {
  target: Vector3;
  update: () => void;
}

interface VerticalCameraPanOptions {
  centerTarget: readonly [number, number, number];
  minTargetY: number;
  maxTargetY: number;
  step?: number;
}

export function useVerticalCameraPan(
  controlsRef: MutableRefObject<OrbitControlsLike | null>,
  {
    centerTarget,
    minTargetY,
    maxTargetY,
    step = 0.22,
  }: VerticalCameraPanOptions,
) {
  const { camera } = useThree();

  useEffect(() => {
    const handleCameraPan = (event: Event) => {
      const controls = controlsRef.current;
      if (!controls) return;

      const { action } = (
        event as CustomEvent<{ action?: CameraPanAction }>
      ).detail ?? {};
      if (action !== 'up' && action !== 'down' && action !== 'center') return;

      if (action === 'center') {
        const target = new Vector3(...centerTarget);
        camera.position.add(target.clone().sub(controls.target));
        controls.target.copy(target);
        controls.update();
        return;
      }

      const requestedDelta = action === 'up' ? step : -step;
      const nextTargetY = Math.min(
        maxTargetY,
        Math.max(minTargetY, controls.target.y + requestedDelta),
      );
      const appliedDelta = nextTargetY - controls.target.y;
      if (Math.abs(appliedDelta) < 0.001) return;

      controls.target.y = nextTargetY;
      camera.position.y += appliedDelta;
      controls.update();
    };

    window.addEventListener(CAMERA_VERTICAL_PAN_EVENT, handleCameraPan);
    return () => {
      window.removeEventListener(CAMERA_VERTICAL_PAN_EVENT, handleCameraPan);
    };
  }, [camera, centerTarget, controlsRef, maxTargetY, minTargetY, step]);
}

export function VerticalCameraControls() {
  const moveCamera = useCallback((action: CameraPanAction) => {
    window.dispatchEvent(
      new CustomEvent(CAMERA_VERTICAL_PAN_EVENT, { detail: { action } }),
    );
  }, []);

  return (
    <div
      className="absolute right-3 top-1/2 z-20 flex -translate-y-1/2 flex-col overflow-hidden rounded-full border border-black/15 bg-white/90 shadow-md backdrop-blur-sm"
      aria-label="Move model vertically"
    >
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center border-b border-black/10 text-xl text-black transition hover:bg-black hover:text-white active:bg-black/80"
        aria-label="Move view up"
        title="Move view up"
        onClick={() => moveCamera('up')}
      >
        <span aria-hidden="true">&#8593;</span>
      </button>
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center border-b border-black/10 text-lg text-black transition hover:bg-black hover:text-white active:bg-black/80"
        aria-label="Re-center model"
        title="Re-center model"
        onClick={() => moveCamera('center')}
      >
        <span aria-hidden="true">&#9678;</span>
      </button>
      <button
        type="button"
        className="flex h-11 w-11 items-center justify-center text-xl text-black transition hover:bg-black hover:text-white active:bg-black/80"
        aria-label="Move view down"
        title="Move view down"
        onClick={() => moveCamera('down')}
      >
        <span aria-hidden="true">&#8595;</span>
      </button>
    </div>
  );
}
