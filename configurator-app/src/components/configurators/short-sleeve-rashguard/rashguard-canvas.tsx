import { memo, Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, Html, OrbitControls, useProgress } from '@react-three/drei';
import {
  Box3,
  Color,
  MathUtils,
  PerspectiveCamera,
  SRGBColorSpace,
  Vector3,
  WebGLRenderTarget,
  type Object3D,
  type Scene as ThreeScene,
  type WebGLRenderer,
} from 'three';

import { useDirectionalCanvasTouch } from '../shared/use-directional-canvas-touch';
import { CAMERA_TARGET } from './rashguard-config';
import {
  cameraViewToPosition,
  useRashguardState,
} from './rashguard-state';
import { RashguardGlbModel } from './rashguard-glb-model';

const CAMERA_MIN_DISTANCE = 2.1;
const DESKTOP_CAMERA_MAX_DISTANCE = 5.8;
const MOBILE_CAMERA_MAX_DISTANCE = 4.85;
const MOBILE_CAMERA_QUERY = '(max-width: 1023px)';

const RashguardModelLoading = memo(() => {
  const { progress } = useProgress();
  const displayProgress = Math.max(1, Math.min(99, Math.round(progress || 1)));

  return (
    <Html center className="pointer-events-none select-none">
      <div className="flex min-w-[230px] items-center gap-3 rounded-full border border-[#dedede] bg-white/90 px-4 py-3 text-[11px] font-semibold tracking-[0.16em] text-[#1c1b1b] uppercase shadow-sm backdrop-blur">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#d7d7d7] border-t-[#5d0909]" />
        <span>Loading Rashguard {displayProgress}%</span>
      </div>
    </Html>
  );
});
RashguardModelLoading.displayName = 'RashguardModelLoading';

const RashguardModelClient = memo(() => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <RashguardModelLoading />;
  return (
    <Suspense fallback={<RashguardModelLoading />}>
      <RashguardGlbModel />
    </Suspense>
  );
});
RashguardModelClient.displayName = 'RashguardModelClient';

// Off-screen capture of the garment from the 4 tech-pack angles (front, back,
// left, right) for the art-file render pages. Renders into a hidden render
// target so the visible canvas never flickers, frames each view on the garment's
// bounding sphere (so all 4 come out the same size), on a clean white ground.
export type GarmentViews = {
  views: { front: string; back: string; left: string; right: string };
  aspect: number;
};

function pixelsToDataUrl(buf: Uint8Array, w: number, h: number) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(w, h);
  // readRenderTargetPixels is bottom-up; flip rows into a top-down canvas.
  const rowBytes = w * 4;
  for (let y = 0; y < h; y++) {
    const src = (h - 1 - y) * rowBytes;
    img.data.set(buf.subarray(src, src + rowBytes), y * rowBytes);
  }
  ctx.putImageData(img, 0, 0);
  // JPEG on a white ground: photographic renders compress ~50× smaller than PNG,
  // keeping the art-file download small. High quality keeps the flat white clean.
  return cv.toDataURL('image/jpeg', 0.95);
}

function captureGarmentViews(
  gl: WebGLRenderer,
  scene: ThreeScene,
): GarmentViews | null {
  const garment = scene.getObjectByName('rashguard-garment') ?? scene;
  const box = new Box3().setFromObject(garment);
  if (box.isEmpty()) return null;
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());

  const W = 1100;
  const H = 1500;
  const aspect = W / H;
  const fovDeg = 26;
  const vFov = MathUtils.degToRad(fovDeg);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  // Frame on the garment's HEIGHT (same in every view → consistent scale) and
  // its widest horizontal extent, not the bounding sphere — the sphere over-pads
  // and leaves the garment floating in whitespace. ~8% breathing room.
  const distV = size.y / 2 / Math.tan(vFov / 2);
  const distH = Math.max(size.x, size.z) / 2 / Math.tan(hFov / 2);
  const dist = Math.max(distV, distH) * 1.08;
  const radius = size.length() / 2;

  const cam = new PerspectiveCamera(fovDeg, aspect, 0.1, dist * 4 + radius);
  const rt = new WebGLRenderTarget(W, H, { samples: 4 });
  // Without this the renderer writes LINEAR colour into the target (it only
  // sRGB-encodes when drawing to the visible canvas), so readback comes out
  // dark/muddy. Tag the target sRGB so colours match the on-screen render.
  rt.texture.colorSpace = SRGBColorSpace;

  const dirs: Record<string, Vector3> = {
    front: new Vector3(0, 0, 1),
    back: new Vector3(0, 0, -1),
    left: new Vector3(-1, 0, 0),
    right: new Vector3(1, 0, 0),
  };

  // Hide everything that isn't the garment or a light (e.g. the contact-shadow
  // ground plane) so the renders sit on clean white, like the reference pack.
  const hidden: Object3D[] = [];
  scene.children.forEach((child) => {
    const isLight = (child as { isLight?: boolean }).isLight;
    if (child === garment || child.name === 'rashguard-garment' || isLight) return;
    if (child.visible) {
      hidden.push(child);
      child.visible = false;
    }
  });

  const prevRT = gl.getRenderTarget();
  const prevClear = new Color();
  gl.getClearColor(prevClear);
  const prevAlpha = gl.getClearAlpha();
  gl.setRenderTarget(rt);
  gl.setClearColor(0xffffff, 1); // clean white ground

  const buf = new Uint8Array(W * H * 4);
  const out = {} as GarmentViews['views'];
  (Object.keys(dirs) as Array<keyof GarmentViews['views']>).forEach((name) => {
    cam.position.copy(center).addScaledVector(dirs[name], dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(center);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    gl.clear();
    gl.render(scene, cam);
    gl.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    out[name] = pixelsToDataUrl(buf, W, H);
  });

  gl.setRenderTarget(prevRT);
  gl.setClearColor(prevClear, prevAlpha);
  rt.dispose();
  hidden.forEach((child) => (child.visible = true));

  return { views: out, aspect };
}

const CanvasBridge = memo(() => {
  const { gl, scene } = useThree();
  const { setCanvasEl } = useRashguardState();

  useEffect(() => {
    setCanvasEl(gl.domElement);
    if (typeof window !== 'undefined') {
      const win = window as unknown as Record<string, unknown>;
      win.__rashguardScene = scene;
      win.__rashguardCaptureViews = () => captureGarmentViews(gl, scene);
    }
    return () => setCanvasEl(null);
  }, [gl, scene, setCanvasEl]);

  return null;
});
CanvasBridge.displayName = 'RashguardCanvasBridge';

const Scene = memo(({ useMobileCamera }: { useMobileCamera: boolean }) => {
  const {
    cameraView,
    cameraViewResetKey,
    isArtworkDragging,
  } = useRashguardState();
  const { camera } = useThree();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const startPos = camera.position.clone();
    const targetPos = new Vector3(
      ...cameraViewToPosition(cameraView, useMobileCamera),
    );
    const targetTgt = new Vector3(...CAMERA_TARGET);
    const startTime = performance.now();
    const duration = 600;
    let raf = 0;

    const tick = () => {
      const t = Math.min(1, (performance.now() - startTime) / duration);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      camera.position.lerpVectors(startPos, targetPos, eased);
      controls.target.copy(targetTgt);
      controls.update();
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [camera, cameraView, cameraViewResetKey, useMobileCamera]);

  useEffect(() => {
    const handlePinch = (event: Event) => {
      const controls = controlsRef.current;
      if (!controls) return;

      const { factor } = (event as CustomEvent<{ factor?: number }>).detail ?? {};
      if (!factor || !Number.isFinite(factor)) return;

      const target = new Vector3(...CAMERA_TARGET);
      const offset = camera.position.clone().sub(target);
      const currentDistance = offset.length();
      const maxDistance = useMobileCamera
        ? MOBILE_CAMERA_MAX_DISTANCE
        : DESKTOP_CAMERA_MAX_DISTANCE;
      const nextDistance = Math.min(
        maxDistance,
        Math.max(CAMERA_MIN_DISTANCE, currentDistance * factor),
      );
      if (currentDistance <= 0) return;

      camera.position.copy(target.clone().add(offset.setLength(nextDistance)));
      controls.target.copy(target);
      controls.update();
    };

    window.addEventListener('dspln:configurator-canvas:pinch', handlePinch);
    return () =>
      window.removeEventListener('dspln:configurator-canvas:pinch', handlePinch);
  }, [camera, useMobileCamera]);

  return (
    <>
      <CanvasBridge />
      <ambientLight intensity={0.85} color="#ffffff" />
      <hemisphereLight args={['#ffffff', '#e3e5ea', 0.45]} />
      <directionalLight
        position={[4, 6, 5]}
        intensity={1.65}
        color="#ffffff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={4}
        shadow-camera-bottom={-1}
        shadow-camera-near={0.5}
        shadow-camera-far={20}
        shadow-bias={-0.0005}
        shadow-normalBias={0.04}
      />
      <directionalLight
        position={[-4, 5, -5]}
        intensity={1.35}
        color="#ffffff"
      />
      <directionalLight position={[-5, 3, 3]} intensity={0.36} color="#ffffff" />
      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.26}
        scale={4.6}
        blur={2.4}
        far={2}
        resolution={1024}
      />

      <RashguardModelClient />

      <OrbitControls
        ref={controlsRef}
        target={CAMERA_TARGET}
        enabled={!isArtworkDragging}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.7}
        zoomSpeed={0.6}
        minDistance={CAMERA_MIN_DISTANCE}
        maxDistance={
          useMobileCamera
            ? MOBILE_CAMERA_MAX_DISTANCE
            : DESKTOP_CAMERA_MAX_DISTANCE
        }
        minPolarAngle={(88 * Math.PI) / 192}
        maxPolarAngle={(104 * Math.PI) / 192}
      />
    </>
  );
});
Scene.displayName = 'RashguardCanvasScene';

export const RashguardCanvas = memo(({ className }: { className?: string }) => {
  const [useMobileCamera, setUseMobileCamera] = useState(false);
  const { cameraView, artworkLayers, selectedArtworkLayerId, selectArtworkLayer } =
    useRashguardState();
  const initialPosition = cameraViewToPosition(cameraView, useMobileCamera);
  const touchHandlers = useDirectionalCanvasTouch();
  const selectedLayer = artworkLayers.find(
    (layer) => layer.id === selectedArtworkLayerId,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia(MOBILE_CAMERA_QUERY);
    const sync = () => setUseMobileCamera(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const t1 = setTimeout(() => window.dispatchEvent(new Event('resize')), 400);
    const t2 = setTimeout(
      () => window.dispatchEvent(new Event('resize')),
      1200,
    );
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div
      ref={touchHandlers.ref}
      onPointerCancel={touchHandlers.onPointerCancel}
      onPointerDown={touchHandlers.onPointerDown}
      onPointerMoveCapture={touchHandlers.onPointerMoveCapture}
      onPointerUp={touchHandlers.onPointerUp}
      className={
        className ??
        'gi-mobile-scroll-canvas relative h-full w-full touch-pan-y bg-white'
      }
      style={{ cursor: selectedLayer?.placementPending ? 'crosshair' : undefined }}
    >
      <Canvas
        onPointerMissed={() => selectArtworkLayer(null)}
        shadows
        frameloop="always"
        style={{ touchAction: 'pan-y' }}
        camera={{ position: initialPosition, fov: 38 }}
        gl={{
          preserveDrawingBuffer: true,
          antialias: true,
          toneMappingExposure: 1.42,
        }}
      >
        <Scene useMobileCamera={useMobileCamera} />
      </Canvas>
    </div>
  );
});

RashguardCanvas.displayName = 'RashguardCanvas';
