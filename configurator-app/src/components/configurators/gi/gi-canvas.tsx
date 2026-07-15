import {
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, Html, OrbitControls, useProgress } from '@react-three/drei';
import { Euler, Matrix4, Quaternion, Vector2, Vector3, type Mesh } from 'three';

import { GiGlbModel } from './gi-glb-model';
import { useGiState, cameraViewToPosition, cameraViewToTarget } from './gi-state';
import {
  CAMERA_TARGET,
  fontCssForBeltFont,
  JACKET_CHEST_ANCHOR,
  KIMONO_LOGO_ANCHORS,
  PANT_LOGO_ANCHORS,
  renderHexFor,
  type KimonoLogoSlot,
  type PantLogoSlot,
} from './gi-config';
import { useDirectionalCanvasTouch } from '../shared/use-directional-canvas-touch';
import { LayerDecal } from '../shared/layer-decal';
import { FrameTicker } from '../shared/frame-ticker';
import { IN_TO_WORLD, ProjectedDecal } from '../shared/projected-decal';
import { isStudioMode } from '../shared/studio-mode';
import { renderTextImage } from '../shared/text-image';
import type { GiTextLayer } from './gi-state';

const CAMERA_MIN_DISTANCE = 1.2;
const DESKTOP_CAMERA_MAX_DISTANCE = 3.75;
const MOBILE_CAMERA_MAX_DISTANCE = 3.35;

// Surface normal for each slot — derived from the slot's plane
// rotation (Y axis only, for our four anchors). Used to push the
// decal slightly off the mesh so it doesn't z-fight.
// Surface normals match each anchor's plane rotation. The sleeves are
// at 45° outward so their normal is a diagonal (sin45 ≈ 0.707).
const SLOT_NORMAL: Record<KimonoLogoSlot, [number, number, number]> = {
  'left-chest': [0, 0, 1],
  'left-sleeve': [0.707, 0, 0.707],
  'right-sleeve': [-0.707, 0, 0.707],
  back: [0, 0, -1],
  'back-skirt': [0, 0, -1],
};

const BELT_TEXT_PLACEMENTS = {
  // UI "left side" maps to the wearer's left belt tail, which appears
  // on the viewer's right in the front camera.
  leftEnd: {
    position: [0.166, 1.277, 0.285] as [number, number, number],
    rotation: [-0.7015, 0.708, -0.5608] as [number, number, number],
    depthWorld: 0.075,
    surfaceIsland: 'frontmost' as const,
  },
  rightEnd: {
    position: [-0.174, 1.278, 0.288] as [number, number, number],
    rotation: [-0.3912, -0.5152, 0.7395] as [number, number, number],
    depthWorld: 0.075,
    surfaceIsland: 'frontmost' as const,
  },
} as const;

function makeBeltTextImageUrl(text: string, color: string, fontName: string) {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const clean = text.trim().toUpperCase();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${Math.max(108, Math.min(184, 1160 / Math.max(clean.length, 6)))}px ${fontCssForBeltFont(fontName)}`;
  ctx.fillText(clean, canvas.width / 2, canvas.height / 2, canvas.width * 0.9);

  return canvas.toDataURL('image/png');
}

const BeltText = memo(
  ({
    text,
    color,
    fontName,
    side,
    mesh,
  }: {
    text: string;
    color: string;
    fontName: string;
    side: keyof typeof BELT_TEXT_PLACEMENTS;
    mesh: Mesh;
  }) => {
    const clean = text.trim();
    const imageUrl = useMemo(
      () => (clean ? makeBeltTextImageUrl(clean, color, fontName) : null),
      [clean, color, fontName],
    );
    if (!clean || !imageUrl) return null;
    const cfg = BELT_TEXT_PLACEMENTS[side];

    return (
      <ProjectedDecal
        mesh={mesh}
        imageUrl={imageUrl}
        position={cfg.position}
        rotation={cfg.rotation}
        widthWorld={0.255}
        heightWorld={0.058}
        depthWorld={cfg.depthWorld}
        surfaceOffsetWorld={0.006}
        normalCullMinDot={0.18}
        surfaceIsland={cfg.surfaceIsland}
      />
    );
  },
);
BeltText.displayName = 'BeltText';

function fitLogoToPrintArea(
  maxSizeIn: { w: number; h: number },
  imageWidth: number,
  imageHeight: number,
) {
  if (imageWidth <= 0 || imageHeight <= 0) return maxSizeIn;

  const imageAspect = imageWidth / imageHeight;
  const printAreaAspect = maxSizeIn.w / maxSizeIn.h;

  if (imageAspect > printAreaAspect) {
    return { w: maxSizeIn.w, h: maxSizeIn.w / imageAspect };
  }

  return { w: maxSizeIn.h * imageAspect, h: maxSizeIn.h };
}

// Toggle to fall back to placeholder primitives. Set to true only if the
// real .glb has loading issues.
const USE_PLACEHOLDER = false;

const GiModelLoading = memo(() => {
  const { progress } = useProgress();
  const displayProgress = Math.max(1, Math.min(99, Math.round(progress || 1)));

  return (
    <Html center className="pointer-events-none select-none">
      <div className="flex min-w-[190px] items-center gap-3 rounded-full border border-[#dedede] bg-white/90 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1c1b1b] shadow-sm backdrop-blur">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#d7d7d7] border-t-[#5d0909]" />
        <span>Loading 3D Gi {displayProgress}%</span>
      </div>
    </Html>
  );
});
GiModelLoading.displayName = 'GiModelLoading';

/**
 * Wraps GiGlbModel so it only mounts on the client. drei's useGLTF
 * suspends on the server (no fetch), and TanStack Start's SSR boundary
 * locks in the Suspense fallback for the initial render — meaning the
 * GLB never starts loading. Deferring to a post-mount render fixes it.
 */
const GiModelClient = memo(() => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <GiModelLoading />;
  return (
    <Suspense fallback={<GiModelLoading />}>
      <GiGlbModel />
    </Suspense>
  );
});
GiModelClient.displayName = 'GiModelClient';

/**
 * Pipes the underlying <canvas> element into gi state once mounted so PDF
 * export and screenshot utilities can grab it without prop-drilling.
 * Also kicks a window resize after mount — without this, r3f's
 * ResizeObserver sometimes misses the initial parent size on TanStack
 * Start's SSR-then-hydrate flow, leaving the WebGL buffer at 300×150.
 */
const CanvasBridge = memo(() => {
  const { camera, gl, scene } = useThree();
  const { setCanvasEl } = useGiState();

  useEffect(() => {
    setCanvasEl(gl.domElement);
    if (typeof window !== 'undefined') {
      const globals = window as unknown as Record<string, unknown>;
      globals.__giRenderer = gl;
      globals.__giScene = scene;
      globals.__giCamera = camera;
    }
    return () => {
      setCanvasEl(null);
      if (typeof window !== 'undefined') {
        const globals = window as unknown as Record<string, unknown>;
        delete globals.__giRenderer;
        delete globals.__giScene;
        delete globals.__giCamera;
      }
    };
  }, [camera, gl, scene, setCanvasEl]);

  return null;
});
CanvasBridge.displayName = 'CanvasBridge';

const MOBILE_CAMERA_QUERY = '(max-width: 1023px)';

// Base physical height of a text layer at 100% scale.
const TEXT_LAYER_BASE_HEIGHT_IN = 1.6;

/** One free-placement text decal. The PNG regenerates from the layer's
 *  parameters, and the in-plane rotation is composed onto the surface
 *  orientation captured while dragging. */
const TextLayerDecal = memo(
  ({ layer, meshes }: { layer: GiTextLayer; meshes: Mesh[] }) => {
    const image = useMemo(
      () => renderTextImage(layer.text, layer.font, layer.colorHex),
      [layer.text, layer.font, layer.colorHex],
    );
    const rotation = useMemo(() => {
      const surface = new Quaternion().setFromEuler(
        new Euler(...layer.rotation),
      );
      surface.multiply(
        new Quaternion().setFromAxisAngle(
          new Vector3(0, 0, 1),
          (layer.rotateDeg * Math.PI) / 180,
        ),
      );
      const euler = new Euler().setFromQuaternion(surface);
      return [euler.x, euler.y, euler.z] as [number, number, number];
    }, [layer.rotation, layer.rotateDeg]);

    if (!image) return null;
    const heightIn = TEXT_LAYER_BASE_HEIGHT_IN * (layer.scalePct / 100);
    const widthIn = heightIn * (image.width / image.height);
    // One projection per target surface: on the chest the lapel overlaps
    // the body, so text must land on whichever surface is on top.
    return meshes.map((mesh) => (
      <ProjectedDecal
        key={mesh.uuid}
        mesh={mesh}
        imageUrl={image.dataUrl}
        position={layer.position}
        rotation={rotation}
        widthWorld={widthIn * IN_TO_WORLD}
        heightWorld={heightIn * IN_TO_WORLD}
        depthWorld={0.3}
        surfaceOffsetWorld={0.008}
        depthTest
        normalCullMinDot={0.18}
      />
    ));
  },
);
TextLayerDecal.displayName = 'TextLayerDecal';

const Scene = memo(({ useMobileCamera }: { useMobileCamera: boolean }) => {
  const {
    layers,
    selectedLayerId,
    selectLayer,
    cameraView,
    cameraViewResetKey,
    kimonoLogos,
    kimonoLogoAnchors,
    setKimonoLogoAnchor,
    textLayers,
    updateTextLayer,
    computedKimonoAnchors,
    kimonoBodyMesh,
    kimonoLogoMeshes,
    pantLogos,
    pantLogoMeshes,
    beltEmbroidery,
    partVisibility,
    scenePartVisibility,
    beltMesh,
  } = useGiState();
  const { camera, gl, raycaster } = useThree();
  // OrbitControls instance ref; the impl type is awkward to import so we
  // pull it from the ref's runtime value when we need methods on it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);

  // On view toggle: smoothly tween the camera to the new preset over
  // ~600ms using requestAnimationFrame. After the tween, OrbitControls
  // owns user input — no constant lerp wrestling against the user.
  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const startPos = camera.position.clone();
    const targetPos = new Vector3(
      ...cameraViewToPosition(cameraView, useMobileCamera),
    );
    const targetTgt = new Vector3(...cameraViewToTarget(cameraView));
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
  }, [cameraView, cameraViewResetKey, camera, useMobileCamera]);

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
    return () => {
      window.removeEventListener(
        'dspln:configurator-canvas:pinch',
        handlePinch,
      );
    };
  }, [camera, useMobileCamera]);

  // ——— Studio drag-to-move for kimono artwork ———
  // Grab a logo/text decal and slide it along the jacket: the pointer is
  // raycast onto the body mesh and the decal's anchor + orientation
  // follow the surface. The final placement is stored in gi-state and
  // serialized with the design, so customers see the moved artwork.
  const isStudio = useMemo(() => isStudioMode(), []);
  const draggingSlotRef = useRef<KimonoLogoSlot | null>(null);
  const draggingTextIdRef = useRef<string | null>(null);
  const lastDragUpdateRef = useRef(0);

  // Draggable artwork lands on whichever jacket surface is on top: the
  // lapel overlaps the body across the chest, so both are drag targets
  // and projection surfaces.
  const kimonoDragSurfaces = useMemo(() => {
    if (!kimonoBodyMesh) return [];
    const lapel = kimonoBodyMesh.parent?.getObjectByName('Kimono_Lapel');
    return lapel && (lapel as Mesh).isMesh
      ? [kimonoBodyMesh, lapel as Mesh]
      : [kimonoBodyMesh];
  }, [kimonoBodyMesh]);

  const anchorFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (kimonoDragSurfaces.length === 0) return null;
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(kimonoDragSurfaces, false)[0];
      if (!hit?.face) return null;
      const normal = hit.face.normal
        .clone()
        .transformDirection(hit.object.matrixWorld)
        .normalize();
      // Anchor floats just off the fabric, like the static anchors do.
      const position = hit.point.clone().addScaledVector(normal, 0.012);
      // Orient the projector so +Z runs along the surface normal while
      // world-up keeps the artwork upright (no roll).
      const euler = new Euler().setFromRotationMatrix(
        new Matrix4().lookAt(
          position.clone().add(normal),
          position,
          new Vector3(0, 1, 0),
        ),
      );
      return {
        position: [position.x, position.y, position.z] as [
          number,
          number,
          number,
        ],
        rotation: [euler.x, euler.y, euler.z] as [number, number, number],
      };
    },
    [camera, gl, kimonoDragSurfaces, raycaster],
  );

  useEffect(() => {
    if (!isStudio) return;

    const handleMove = (event: PointerEvent) => {
      if (!draggingSlotRef.current && !draggingTextIdRef.current) return;
      event.preventDefault();
      // DecalGeometry rebuilds on every anchor change — throttle so the
      // drag stays smooth on the dense gi mesh.
      const now = performance.now();
      if (now - lastDragUpdateRef.current < 90) return;
      lastDragUpdateRef.current = now;
      const anchor = anchorFromPointer(event.clientX, event.clientY);
      if (!anchor) return;
      if (draggingSlotRef.current) {
        setKimonoLogoAnchor(draggingSlotRef.current, anchor);
      } else if (draggingTextIdRef.current) {
        updateTextLayer(draggingTextIdRef.current, anchor);
      }
    };

    const handleUp = (event: PointerEvent) => {
      const slot = draggingSlotRef.current;
      const textId = draggingTextIdRef.current;
      if (!slot && !textId) return;
      draggingSlotRef.current = null;
      draggingTextIdRef.current = null;
      const anchor = anchorFromPointer(event.clientX, event.clientY);
      if (anchor && slot) setKimonoLogoAnchor(slot, anchor);
      if (anchor && textId) updateTextLayer(textId, anchor);
      if (controlsRef.current) controlsRef.current.enabled = true;
      document.body.style.cursor = '';
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [anchorFromPointer, isStudio, setKimonoLogoAnchor, updateTextLayer]);

  return (
    <>
      <CanvasBridge />
      <FrameTicker />
      {/* Studio-mockup lighting with proper contrast:
          - Strong key with self-shadowing → folds, belt overlap, lapel
          - Modest fill so shadows stay visible but not pitch-black
          - Rim light for silhouette separation
          - Floor contact shadow grounds the gi */}
      <ambientLight intensity={0.65} color="#ffffff" />
      <hemisphereLight args={['#ffffff', '#e2e2e6', 0.4]} />
      {/* Front key — casts shadows. Drives the front-side highlights. */}
      <directionalLight
        position={[5, 7, 5]}
        intensity={1.85}
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
      {/* Back key — mirror of front key, no shadows. Lights the gi's
          rear so the Back view looks as bright + shaped as the Front. */}
      <directionalLight
        position={[-5, 7, -5]}
        intensity={1.5}
        color="#ffffff"
      />
      {/* Side fill — softens the off-key side from either view */}
      <directionalLight position={[-5, 3, 3]} intensity={0.4} color="#ffffff" />
      {/* Soft floor contact shadow under the gi */}
      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.35}
        scale={5}
        blur={2.6}
        far={2}
        resolution={1024}
      />

      {USE_PLACEHOLDER ? <GiModelLoading /> : <GiModelClient />}

      {/* Legacy free-form layers (left in place — empty in v1 flow). */}
      {layers.map((layer) => (
        <LayerDecal
          key={layer.id}
          imageUrl={layer.imageUrl}
          position={JACKET_CHEST_ANCHOR.position}
          normal={JACKET_CHEST_ANCHOR.normal}
          widthIn={layer.widthIn}
          heightIn={layer.heightIn}
          rotateDeg={layer.rotateDeg}
          scalePct={layer.scalePct}
          visible={layer.visible}
          selected={layer.id === selectedLayerId}
          onPointerDown={() => selectLayer(layer.id)}
        />
      ))}

      {/* Named kimono logo slots — chest, sleeves, back. Projects via
          DecalGeometry onto the actual mesh surface so the texture
          wraps around the body's curves. */}
      {partVisibility.jacket && scenePartVisibility.jacket && kimonoBodyMesh
        ? Object.entries(kimonoLogos).map((entry) => {
            const slot = entry[0] as KimonoLogoSlot;
            const logo = entry[1];
            if (!logo) return null;
            const cfg = KIMONO_LOGO_ANCHORS[slot];
            const decalSize = fitLogoToPrintArea(
              cfg.defaultSizeIn,
              logo.imageWidth,
              logo.imageHeight,
            );
            const override = kimonoLogoAnchors[slot];
            const position =
              override?.position ?? computedKimonoAnchors?.[slot] ?? cfg.position;
            const rotation = override?.rotation ?? cfg.rotation;
            const isSleeve = slot === 'left-sleeve' || slot === 'right-sleeve';
            // Both back slots project onto the body mesh itself — the
            // dedicated logo placement meshes only cover chest/sleeves.
            // A dragged decal can be anywhere, so it always projects onto
            // the body mesh with generic free-placement settings.
            const isBackPanel = slot === 'back' || slot === 'back-skirt';
            const targetMeshes = override
              ? kimonoDragSurfaces
              : !isBackPanel && kimonoLogoMeshes.length > 0
                ? kimonoLogoMeshes
                : [kimonoBodyMesh];
            const decals = targetMeshes.map((mesh) => (
              <ProjectedDecal
                key={`${slot}-${mesh.uuid}`}
                mesh={mesh}
                imageUrl={logo.imageUrl}
                position={position}
                rotation={rotation}
                widthWorld={decalSize.w * IN_TO_WORLD}
                heightWorld={decalSize.h * IN_TO_WORLD}
                depthWorld={
                  override
                    ? 0.3
                    : slot === 'back'
                      ? // Deep enough to keep projecting where the jacket
                        // tapers inward at the waist — 0.36 clipped the
                        // bottom of a full-size back logo. The box is too
                        // narrow to ever reach the front panel (z ≈ +0.42).
                        0.7
                      : slot === 'back-skirt'
                        ? 0.36
                        : slot === 'left-chest'
                          ? 0.18
                          : isSleeve
                            ? 0.32
                            : undefined
                }
                surfaceOffsetWorld={override || isBackPanel ? 0.008 : 0.003}
                depthTest
                polygonOffsetFactor={isBackPanel ? -2 : undefined}
                polygonOffsetUnits={isBackPanel ? -2 : undefined}
                normalCullMinDot={
                  // The deeper back box can catch sleeve fabric hanging
                  // beside the torso; sleeves face sideways, so culling
                  // triangles that don't face backwards drops them while
                  // keeping the back panel (and its waist taper).
                  slot === 'back' && !override ? 0.35 : 0.18
                }
                surfaceIsland={
                  // The skirt strip spans the waist seam, so island
                  // filtering would clip it; its shallow projection box
                  // can't reach the front, so no filter is needed. Same
                  // reasoning for dragged (override) placements.
                  override
                    ? undefined
                    : slot === 'back'
                      ? 'largest'
                      : slot === 'back-skirt'
                        ? undefined
                        : 'frontmost'
                }
              />
            ));
            if (!isStudio) return decals;
            return (
              <group
                key={slot}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  draggingSlotRef.current = slot;
                  lastDragUpdateRef.current = 0;
                  if (controlsRef.current) controlsRef.current.enabled = false;
                  document.body.style.cursor = 'grabbing';
                }}
                onPointerOver={() => {
                  if (!draggingSlotRef.current) {
                    document.body.style.cursor = 'grab';
                  }
                }}
                onPointerOut={() => {
                  if (!draggingSlotRef.current) {
                    document.body.style.cursor = '';
                  }
                }}
              >
                {decals}
              </group>
            );
          })
        : null}

      {/* Free-placement text layers (studio-created, +$10 each). They
          render for everyone; only dragging is studio-gated. */}
      {partVisibility.jacket && scenePartVisibility.jacket && kimonoBodyMesh
        ? textLayers.map((layer) => {
            const decal = (
              <TextLayerDecal
                key={layer.id}
                layer={layer}
                meshes={kimonoDragSurfaces}
              />
            );
            if (!isStudio) return decal;
            return (
              <group
                key={layer.id}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  draggingTextIdRef.current = layer.id;
                  lastDragUpdateRef.current = 0;
                  if (controlsRef.current) controlsRef.current.enabled = false;
                  document.body.style.cursor = 'grabbing';
                }}
                onPointerOver={() => {
                  if (!draggingSlotRef.current && !draggingTextIdRef.current) {
                    document.body.style.cursor = 'grab';
                  }
                }}
                onPointerOut={() => {
                  if (!draggingSlotRef.current && !draggingTextIdRef.current) {
                    document.body.style.cursor = '';
                  }
                }}
              >
                {decal}
              </group>
            );
          })
        : null}

      {partVisibility.pants && scenePartVisibility.pants
        ? Object.entries(pantLogos).map((entry) => {
            const slot = entry[0] as PantLogoSlot;
            const logo = entry[1];
            if (!logo) return null;
            const pantLogoMesh = pantLogoMeshes[slot];
            if (!pantLogoMesh) return null;
            const cfg = PANT_LOGO_ANCHORS[slot];
            const decalSize = fitLogoToPrintArea(
              cfg.defaultSizeIn,
              logo.imageWidth,
              logo.imageHeight,
            );
            return (
              <ProjectedDecal
                key={`${slot}-${pantLogoMesh.uuid}`}
                mesh={pantLogoMesh}
                imageUrl={logo.imageUrl}
                position={cfg.position}
                rotation={cfg.rotation}
                widthWorld={decalSize.w * IN_TO_WORLD}
                heightWorld={decalSize.h * IN_TO_WORLD}
                depthWorld={0.32}
                surfaceOffsetWorld={0.003}
                surfaceIsland="frontmost"
              />
            );
          })
        : null}

      {partVisibility.belt && scenePartVisibility.belt && beltMesh ? (
        <>
          <BeltText
            mesh={beltMesh}
            text={beltEmbroidery.leftEnd}
            color={renderHexFor(beltEmbroidery.leftThreadColor)}
            fontName={beltEmbroidery.leftFont}
            side="leftEnd"
          />
          <BeltText
            mesh={beltMesh}
            text={beltEmbroidery.rightEnd}
            color={renderHexFor(beltEmbroidery.rightThreadColor)}
            fontName={beltEmbroidery.rightFont}
            side="rightEnd"
          />
        </>
      ) : null}

      <OrbitControls
        ref={controlsRef}
        target={CAMERA_TARGET}
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
        minPolarAngle={(79 * Math.PI) / 192}
        maxPolarAngle={(113 * Math.PI) / 192}
      />
    </>
  );
});
Scene.displayName = 'GiCanvasScene';

interface GiCanvasProps {
  className?: string;
}

/**
 * The 3D scene the merchant interacts with. Sits where the Fabric.js
 * canvas sits in the 2D editor.
 */
export const GiCanvas = memo(({ className }: GiCanvasProps) => {
  const { selectLayer, cameraView } = useGiState();
  const [useMobileCamera, setUseMobileCamera] = useState(false);
  const initialPosition = cameraViewToPosition(cameraView, useMobileCamera);
  const touchHandlers = useDirectionalCanvasTouch();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia(MOBILE_CAMERA_QUERY);
    const sync = () => setUseMobileCamera(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  // r3f's ResizeObserver sometimes misses the parent's final size on
  // TanStack Start's SSR-then-hydrate flow, leaving the WebGL buffer
  // (and the canvas display) stuck at 300×150. Dispatching a window
  // resize a beat AFTER the Canvas has had time to fully initialize
  // forces r3f's observer to pick up the real container dimensions.
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
        'gi-mobile-scroll-canvas relative h-full w-full touch-none bg-white'
      }
    >
      <Canvas
        shadows
        frameloop="always"
        style={{ touchAction: 'none' }}
        camera={{ position: initialPosition, fov: 42 }}
        onPointerMissed={() => selectLayer(null)}
        gl={{
          preserveDrawingBuffer: true,
          antialias: true,
          toneMappingExposure: 1.3,
        }}
      >
        <Scene useMobileCamera={useMobileCamera} />
      </Canvas>
    </div>
  );
});

GiCanvas.displayName = 'GiCanvas';
