import { useFrame } from '@react-three/fiber';

declare global {
  interface Window {
    __dsplnRenderedFrames?: number;
  }
}

/**
 * Counts frames the 3D scene ACTUALLY renders. The tech-pack page waits on
 * this counter instead of wall-clock delays: browsers pause a hidden or
 * covered window's render loop while timers keep firing, so time-based waits
 * used to photograph half-turned / stale frames when the user clicked away
 * mid-generation. Frame-based waits simply pause with the render loop and
 * resume when the window is visible again.
 */
export function FrameTicker() {
  useFrame(() => {
    window.__dsplnRenderedFrames = (window.__dsplnRenderedFrames ?? 0) + 1;
  });
  return null;
}
