import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Html, useGLTF } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Expand, Lock, RotateCw, Trash2, Unlock } from 'lucide-react';
import {
  Box3,
  BackSide,
  CanvasTexture,
  ClampToEdgeWrapping,
  Color,
  FrontSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';
import type { Group } from 'three';

import {
  RASHGUARD_ARTWORK_TARGET_MESH_NAMES,
  RASHGUARD_DECORATIVE_MESH_NAMES,
  RASHGUARD_MESH_TO_PART,
  RASHGUARD_MODEL_URL,
  RASHGUARD_STITCH_GRAFT_URL,
  renderHexFor,
  type CameraView,
  type RashguardArtworkTarget,
  type RashguardPart,
} from './rashguard-config';
import {
  useRashguardState,
  type RashguardArtworkLayer,
} from './rashguard-state';

// The inside of the shirt (visible at the hems/cuffs/neck) is a separate lining
// shell. We tint each lining panel to a light ~25% version of its outer panel's
// colour, so the interior reads as a faded version of the print.
const INSIDE_PRINT_STRENGTH = 0.25;

// Artwork zones whose UV is mirror-flipped on this model (the right sleeve is the
// mirror-image pattern piece), so on-model artwork must be drawn horizontally
// flipped to read correctly.
const MIRRORED_UV_TARGETS = new Set<RashguardArtworkTarget>(['rightSleeve']);

// Map a lining mesh to the garment part whose colour it should echo.
function liningPartForMesh(mesh: Mesh): RashguardPart | null {
  const n = normalizedMeshName(mesh.name);
  if (!n.includes('lining')) return null;
  if (n.includes('front')) return 'front';
  if (n.includes('back')) return 'back';
  if (n.includes('right sleeve')) return 'rightSleeve';
  if (n.includes('left sleeve')) return 'leftSleeve';
  // This model ships a single combined "Lining" mesh (not per-panel), so echo
  // the front colour for the faded-inside look.
  return 'front';
}

function normalizedMeshName(name: string | undefined) {
  return (
    name
      ?.trim()
      .toLowerCase()
      .replace(/\.\d+$/, '')
      .replace(/[_\s]+/g, ' ') ?? ''
  );
}

function isNormalizedNameMatch(actual: string, expected: string) {
  return actual === expected || actual.startsWith(`${expected}.`);
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

const NORMALIZED_MESH_TO_PART = Object.fromEntries(
  Object.entries(RASHGUARD_MESH_TO_PART).map(([name, part]) => [
    normalizedMeshName(name),
    part,
  ]),
) as Record<string, RashguardPart>;

const NORMALIZED_DECORATIVE_MESH_NAMES = new Set(
  Array.from(RASHGUARD_DECORATIVE_MESH_NAMES, normalizedMeshName),
);

function meshNameCandidates(mesh: Mesh) {
  return [
    mesh.name,
    mesh.geometry?.name,
    mesh.parent?.name,
    mesh.parent?.parent?.name,
  ].map(normalizedMeshName);
}

function artworkTargetForMesh(mesh: Mesh): RashguardArtworkTarget | null {
  const names = meshNameCandidates(mesh);
  for (const [target, targetName] of Object.entries(
    RASHGUARD_ARTWORK_TARGET_MESH_NAMES,
  )) {
    const normalizedTargetName = normalizedMeshName(targetName);
    if (
      names.some((name) => isNormalizedNameMatch(name, normalizedTargetName))
    ) {
      return target as RashguardArtworkTarget;
    }
  }
  return null;
}

function isInsideLabelTargetMesh(mesh: Mesh) {
  const targetName = normalizedMeshName('INSIDE LABEL TARGET MESH');
  return meshNameCandidates(mesh)
    .some((name) => isNormalizedNameMatch(name, targetName));
}

function targetPartForMesh(mesh: Mesh): RashguardPart | null {
  return artworkTargetForMesh(mesh);
}

// Resolve which artwork zone a raycast/placement hit belongs to. A dedicated
// "Target Mesh *" wins when present; otherwise the garment panel mesh itself is
// the placement surface — this model ships without Target Meshes, so artwork and
// text are placed directly on the body/sleeve panels.
function artworkTargetForHit(mesh: Mesh): RashguardArtworkTarget | null {
  const targetMesh = artworkTargetForMesh(mesh);
  if (targetMesh) return targetMesh;
  if (isInsideLabelTargetMesh(mesh)) return null;
  const part = partForMesh(mesh);
  return part && isArtworkPart(part) ? part : null;
}

function partForMesh(mesh: Mesh): RashguardPart | null {
  const targetPart = targetPartForMesh(mesh);
  if (targetPart) return targetPart;

  const names = [
    mesh.name,
    mesh.geometry?.name,
    mesh.parent?.name,
    mesh.parent?.parent?.name,
    Array.isArray(mesh.material)
      ? mesh.material.map((mat) => mat.name)
      : mesh.material?.name,
  ]
    .flat()
    .filter(Boolean)
    .map((name) => String(name));

  for (const name of names) {
    const normalizedName = normalizedMeshName(name);
    if (NORMALIZED_DECORATIVE_MESH_NAMES.has(normalizedName)) return null;
    // Multi-primitive meshes get a trailing index from three.js (e.g. "Front_1"
    // → "front 1"); strip it so every primitive of a panel maps to its zone.
    const part =
      NORMALIZED_MESH_TO_PART[normalizedName] ??
      NORMALIZED_MESH_TO_PART[normalizedName.replace(/ \d+$/, '')];
    if (part) return part;
  }

  // Fallback: treat any mesh/material whose name reads as stitching as the
  // stitching zone. Covers grouped topstitch whose extra primitives three.js
  // renames (e.g. Topstitch_581246_1 / _2) and new material IDs not yet in the
  // explicit map — so all topstitch colors with the Stitching swatch.
  for (const name of names) {
    const n = normalizedMeshName(name);
    if (n.includes('topstitch') || n.includes('coverlock') || n.includes('stitch')) {
      return 'stitching';
    }
  }

  return null;
}

function ensureUniqueMaterialForMesh(mesh: Mesh) {
  const ownerKey = `rashguard:${mesh.uuid}`;
  if (Array.isArray(mesh.material)) {
    mesh.material = mesh.material.map((mat) => {
      if (mat.userData.rashguardMaterialOwner === ownerKey) return mat;
      const next = mat.clone();
      next.userData.rashguardMaterialOwner = ownerKey;
      return next;
    });
    return;
  }

  if (!mesh.material) return;
  if (mesh.material.userData.rashguardMaterialOwner === ownerKey) return;
  const next = mesh.material.clone();
  next.userData.rashguardMaterialOwner = ownerKey;
  mesh.material = next;
}

function ensureGroupedStitchingMaterial(mesh: Mesh) {
  if (mesh.userData.rashguardGroupedStitchingMaterial) return;
  const groups = mesh.geometry.groups;
  if (!groups || groups.length < 3 || Array.isArray(mesh.material)) return;
  const base = mesh.material as MeshStandardMaterial;
  mesh.material = groups.map((group, index) => {
    const isStitchingGroup = index === 2;
    const next = isStitchingGroup
      ? new MeshBasicMaterial({
          color: '#ffffff',
          depthTest: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -8,
          polygonOffsetUnits: -8,
          side: FrontSide,
          toneMapped: false,
        })
      : base.clone();
    next.name = isStitchingGroup
      ? `${base.name || mesh.name}_Stitching`
      : base.name;
    next.userData.rashguardMaterialOwner = `rashguard:${mesh.uuid}:${index}`;
    next.userData.rashguardPartOverride = isStitchingGroup
      ? 'stitching'
      : null;
    group.materialIndex = index;
    return next;
  });
  mesh.userData.rashguardGroupedStitchingMaterial = true;
}

const STITCHING_GROUP_INDEX = 2;

function ensureStitchingOverlayMesh(mesh: Mesh, stitchingColor: Color) {
  const groups = mesh.geometry.groups;
  if (!groups || groups.length <= STITCHING_GROUP_INDEX || !mesh.parent) return;

  const existing = mesh.userData.rashguardStitchingOverlayMesh as
    | Mesh
    | undefined;
  const overlay = existing ?? mesh.clone(false);

  if (!existing) {
    overlay.name = `${mesh.name || mesh.geometry.name || 'Rashguard'} Stitching Overlay`;
    overlay.userData.rashguardStitchingOverlay = true;
    overlay.geometry = mesh.geometry;
    overlay.renderOrder = 1000;
    overlay.castShadow = false;
    overlay.receiveShadow = false;
    overlay.frustumCulled = false;
    mesh.parent.add(overlay);
    mesh.userData.rashguardStitchingOverlayMesh = overlay;
  }

  overlay.visible = mesh.visible;
  overlay.position.copy(mesh.position);
  overlay.quaternion.copy(mesh.quaternion);
  overlay.scale.copy(mesh.scale);

  const previous = overlay.material;
  if (Array.isArray(previous)) previous.forEach((mat) => mat.dispose());
  else previous?.dispose();

  overlay.material = groups.map((_, index) => {
    if (index === STITCHING_GROUP_INDEX) {
      const stitchMaterial = new MeshBasicMaterial({
        color: stitchingColor,
        transparent: true,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -20,
        polygonOffsetUnits: -20,
        side: FrontSide,
        toneMapped: false,
      });
      stitchMaterial.userData.rashguardPartOverride = 'stitching';
      return stitchMaterial;
    }

    return new MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
      side: FrontSide,
    });
  });
}

function uvBoundsForMesh(mesh: Mesh) {
  const uv = mesh.geometry.attributes.uv;
  if (!uv || uv.count <= 0) {
    return { minU: 0, minV: 0, maxU: 1, maxV: 1, width: 1, height: 1 };
  }
  let minU = Infinity;
  let minV = Infinity;
  let maxU = -Infinity;
  let maxV = -Infinity;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    minU = Math.min(minU, u);
    minV = Math.min(minV, v);
    maxU = Math.max(maxU, u);
    maxV = Math.max(maxV, v);
  }
  return {
    minU,
    minV,
    maxU,
    maxV,
    width: maxU - minU || 1,
    height: maxV - minV || 1,
  };
}

// On-screen artwork/colour canvas per zone. 2048 is plenty for the model view
// (the panel covers ~300px on screen) and rebuilds ~4× faster than 4096 on each
// colour change. The art-file export renders at its own print DPI, unaffected.
const TARGET_CANVAS_SIZE = 2048;
const DEFAULT_ARTWORK_WIDTH = 0.28;
const FIXED_DSPLN_LOGO_URL = '/logos/dspln-back-logo.png';
const imageLoadCache = new Map<string, Promise<HTMLImageElement | null>>();

function fontStackForLayer(layer: RashguardArtworkLayer) {
  const fontFamily = layer.fontFamily || 'Arial';
  if (fontFamily === 'Arial Black') {
    return '"Arial Black", Arial, Helvetica, sans-serif';
  }
  if (fontFamily === 'Times New Roman') {
    return '"Times New Roman", Times, serif';
  }
  if (fontFamily === 'Georgia') return 'Georgia, serif';
  if (fontFamily === 'Impact') return 'Impact, "Arial Black", sans-serif';
  if (fontFamily === 'Verdana') return 'Verdana, Geneva, sans-serif';
  return 'Arial, Helvetica, sans-serif';
}

function canvasSizeForUvBounds(uvBounds: ReturnType<typeof uvBoundsForMesh>) {
  const aspect = uvBounds.width / Math.max(0.001, uvBounds.height);
  if (aspect >= 1) {
    return {
      width: TARGET_CANVAS_SIZE,
      height: Math.max(128, Math.round(TARGET_CANVAS_SIZE / aspect)),
    };
  }
  return {
    width: Math.max(128, Math.round(TARGET_CANVAS_SIZE * aspect)),
    height: TARGET_CANVAS_SIZE,
  };
}

function applyUvBoundsTextureTransform(
  texture: CanvasTexture,
  uvBounds: ReturnType<typeof uvBoundsForMesh>,
) {
  texture.repeat.set(1 / uvBounds.width, 1 / uvBounds.height);
  texture.offset.set(-uvBounds.minU / uvBounds.width, -uvBounds.minV / uvBounds.height);
}

type ArtworkCameraView = CameraView | 'side';

const SIDE_ARTWORK_VIEW_RATIO = 0.85;

function artworkCameraViewFromPosition(position: Vector3): ArtworkCameraView {
  const absX = Math.abs(position.x);
  const absZ = Math.abs(position.z);
  if (absX > 0.001 && absZ <= absX * SIDE_ARTWORK_VIEW_RATIO) {
    return 'side';
  }
  return cameraSideFromZ(position.z);
}

function shouldShowControlsForCamera(
  target: RashguardArtworkTarget,
  cameraView: ArtworkCameraView,
) {
  if (cameraView === 'side') return true;
  if (target === 'back') return cameraView === 'back';
  if (target === 'front') return cameraView === 'front';
  return true;
}

function cameraSideFromZ(z: number): CameraView {
  return z < 0 ? 'back' : 'front';
}

function loadImageUrl(url: string) {
  const cached = imageLoadCache.get(url);
  if (cached) return cached;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => {
      imageLoadCache.delete(url);
      resolve(null);
    };
    image.src = url;
  });
  imageLoadCache.set(url, promise);
  return promise;
}

function drawImageInUvBox(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  placement: { x: number; y: number; maxW: number; maxH: number },
) {
  const canvas = ctx.canvas;
  const aspect = image.naturalWidth / Math.max(1, image.naturalHeight);
  let width = placement.maxW * canvas.width;
  let height = width / Math.max(0.001, aspect);
  const maxHeight = placement.maxH * canvas.height;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspect;
  }

  const x = placement.x * canvas.width;
  const y = (1 - placement.y) * canvas.height;

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(x, y);
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
}

// Text size is driven by `scale` (font height), NOT by a fixed box — so adding
// more letters makes the text grow WIDER instead of condensing to fit. This ratio
// keeps the default (scale 1) size unchanged from before.
const TEXT_FONT_RATIO = 0.0493;

function textFontSize(canvasWidth: number, scale: number) {
  return Math.max(28, TEXT_FONT_RATIO * scale * canvasWidth);
}

// One shared offscreen 2D context for measuring text width.
let sharedMeasureCtx: CanvasRenderingContext2D | null = null;
function measureTextWidth(text: string, fontSize: number, fontStack: string) {
  if (typeof document !== 'undefined') {
    if (!sharedMeasureCtx) {
      sharedMeasureCtx = document.createElement('canvas').getContext('2d');
    }
    if (sharedMeasureCtx) {
      sharedMeasureCtx.font = `800 ${fontSize}px ${fontStack}`;
      return sharedMeasureCtx.measureText(text).width;
    }
  }
  // SSR / no-canvas fallback: rough average glyph width.
  return text.length * fontSize * 0.55;
}

function layerPixelMetrics(
  canvasSize: { width: number; height: number },
  layer: RashguardArtworkLayer,
) {
  if (layer.kind === 'text') {
    const fontSize = textFontSize(canvasSize.width, layer.scale);
    const text = layer.text?.trim() || 'TEXT';
    const outlinePad = fontSize * ((layer.outlineWidth ?? 0) / 100);
    const measured = measureTextWidth(text, fontSize, fontStackForLayer(layer));
    return {
      centerX: layer.x * canvasSize.width,
      centerY: layer.y * canvasSize.height,
      width: measured + outlinePad,
      height: fontSize * 1.2 + outlinePad,
      fontSize,
    };
  }
  const imageAspect = layer.imageWidth / Math.max(1, layer.imageHeight);
  const width = DEFAULT_ARTWORK_WIDTH * layer.scale * canvasSize.width;
  const height = width / Math.max(0.001, imageAspect);
  return {
    centerX: layer.x * canvasSize.width,
    centerY: layer.y * canvasSize.height,
    width,
    height,
    fontSize: 0,
  };
}

function drawArtworkLayer(
  ctx: CanvasRenderingContext2D,
  layer: RashguardArtworkLayer,
  image?: HTMLImageElement,
  flipX = false,
) {
  const metrics = layerPixelMetrics(ctx.canvas, layer);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(metrics.centerX, metrics.centerY);
  ctx.rotate((layer.rotationDeg * Math.PI) / 180);
  // This model's right sleeve has a mirror-flipped UV (it's the mirror-image
  // pattern piece), so text/images map on backwards. Mirror the content around
  // its own centre to cancel that out — position is unchanged.
  if (flipX) ctx.scale(-1, 1);
  if (layer.kind === 'text') {
    const fontSize = metrics.fontSize || textFontSize(ctx.canvas.width, layer.scale);
    ctx.font = `800 ${fontSize}px ${fontStackForLayer(layer)}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    const text = layer.text?.trim() || 'TEXT';
    const outlineWidth = layer.outlineWidth ?? 0;
    // No maxWidth argument: the text renders at its natural width and grows
    // wider with more letters, instead of being condensed into a fixed box.
    if (outlineWidth > 0) {
      ctx.strokeStyle = layer.outlineColor ?? '#000000';
      ctx.lineWidth = fontSize * (outlineWidth / 100);
      ctx.strokeText(text, 0, 0);
    }
    ctx.fillStyle = layer.color ?? '#ffffff';
    ctx.fillText(text, 0, 0);
  } else if (image) {
    ctx.drawImage(
      image,
      -metrics.width / 2,
      -metrics.height / 2,
      metrics.width,
      metrics.height,
    );
  }
  ctx.restore();
}

function layerContainsPoint(
  layer: RashguardArtworkLayer,
  point: { x: number; y: number },
  canvasSize: { width: number; height: number },
) {
  const metrics = layerPixelMetrics(canvasSize, layer);
  const px = point.x * canvasSize.width;
  const py = point.y * canvasSize.height;
  const dx = px - metrics.centerX;
  const dy = py - metrics.centerY;
  const angle = (-layer.rotationDeg * Math.PI) / 180;
  const rotatedX = dx * Math.cos(angle) - dy * Math.sin(angle);
  const rotatedY = dx * Math.sin(angle) + dy * Math.cos(angle);
  return (
    Math.abs(rotatedX) <= metrics.width / 2 &&
    Math.abs(rotatedY) <= metrics.height / 2
  );
}

function topArtworkLayerAtPoint(
  artworkLayers: RashguardArtworkLayer[],
  target: RashguardArtworkTarget,
  point: { x: number; y: number },
  canvasSize: { width: number; height: number },
) {
  for (let index = artworkLayers.length - 1; index >= 0; index--) {
    const layer = artworkLayers[index];
    if (!layer.visible || layer.placementPending || layer.target !== target) continue;
    if (layerContainsPoint(layer, point, canvasSize)) return layer;
  }
  return null;
}

async function drawFixedDsplnMarks(
  ctx: CanvasRenderingContext2D,
  target: RashguardArtworkTarget,
) {
  if (target !== 'back') return;
  const logo = await loadImageUrl(FIXED_DSPLN_LOGO_URL);
  if (!logo) return;

  drawImageInUvBox(
    ctx,
    logo,
    { x: 0.5, y: 0.9275, maxW: 0.24, maxH: 0.04125 },
  );
}

async function createInsideLabelCanvasTexture(mesh: Mesh) {
  const uvBounds = uvBoundsForMesh(mesh);
  const canvasSize = canvasSizeForUvBounds(uvBounds);
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize.width;
  canvas.height = canvasSize.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const logo = await loadImageUrl(FIXED_DSPLN_LOGO_URL);
  if (!logo) return null;
  drawImageInUvBox(
    ctx,
    logo,
    { x: 0.5, y: 0.5, maxW: 0.78, maxH: 0.28 },
  );

  const texture = new CanvasTexture(canvas);
  applyUvBoundsTextureTransform(texture, uvBounds);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 8;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

async function createArtworkCanvasTexture(
  mesh: Mesh,
  target: RashguardArtworkTarget,
  artworkLayers: RashguardArtworkLayer[],
  backgroundColor?: string,
) {
  const uvBounds = uvBoundsForMesh(mesh);
  const canvasSize = canvasSizeForUvBounds(uvBounds);
  const canvas = document.createElement('canvas');
  canvas.width = canvasSize.width;
  canvas.height = canvasSize.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (backgroundColor) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // The right sleeve's UV is mirror-flipped on this model, so its on-model
  // artwork must be drawn mirrored to read correctly. (The flat art-file print
  // stays un-mirrored — that's physically correct for the fabric piece.)
  const flipX = MIRRORED_UV_TARGETS.has(target);

  for (const layer of artworkLayers) {
    if (!layer.visible || layer.placementPending || layer.target !== target) continue;
    if (layer.kind === 'text') {
      drawArtworkLayer(ctx, layer, undefined, flipX);
      continue;
    }
    if (!layer.imageUrl) continue;
    const image = await loadImageUrl(layer.imageUrl);
    if (!image) continue;
    drawArtworkLayer(ctx, layer, image, flipX);
  }

  await drawFixedDsplnMarks(ctx, target);

  const texture = new CanvasTexture(canvas);
  applyUvBoundsTextureTransform(texture, uvBounds);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 8;
  texture.flipY = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Render a single zone's artwork (image + text layers, optional fixed DSPLN back
 * mark) onto a transparent canvas of an arbitrary size. Used by the art-file
 * export to composite each piece at PRINT resolution. Positions/scale are
 * normalised to the canvas, exactly as on the 3D model, so the result matches.
 */
export async function buildZoneArtworkCanvas(
  target: RashguardArtworkTarget,
  artworkLayers: RashguardArtworkLayer[],
  options: { width: number; height: number; includeBackLogo?: boolean },
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(options.width));
  canvas.height = Math.max(1, Math.round(options.height));
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const layer of artworkLayers) {
    if (!layer.visible || layer.placementPending || layer.target !== target) continue;
    if (layer.kind === 'text') {
      drawArtworkLayer(ctx, layer);
      continue;
    }
    if (!layer.imageUrl) continue;
    const image = await loadImageUrl(layer.imageUrl);
    if (!image) continue;
    drawArtworkLayer(ctx, layer, image);
  }

  if (options.includeBackLogo !== false) {
    await drawFixedDsplnMarks(ctx, target);
  }
  return canvas;
}

function isArtworkPart(part: RashguardPart): part is RashguardArtworkTarget {
  return (
    part === 'front' ||
    part === 'back' ||
    part === 'leftSleeve' ||
    part === 'rightSleeve' ||
    part === 'neckBand'
  );
}

function makeInvisibleHitTargetMaterial() {
  return new MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    colorWrite: false,
    side: FrontSide,
    toneMapped: false,
  });
}

function normalizedPointFromUv(mesh: Mesh, uv: Vector2) {
  const bounds = uvBoundsForMesh(mesh);
  return {
    x: clamp((uv.x - bounds.minU) / bounds.width),
    y: clamp((uv.y - bounds.minV) / bounds.height),
  };
}

function artworkTargetHitFromEvent(event: ThreeEvent<PointerEvent>) {
  for (const intersection of event.intersections) {
    const mesh = intersection.object as Mesh;
    if (!mesh?.isMesh || !intersection.uv) continue;
    const target = artworkTargetForHit(mesh);
    if (!target) continue;
    return {
      mesh,
      target,
      point: normalizedPointFromUv(mesh, intersection.uv),
    };
  }

  const mesh = event.object as Mesh;
  if (mesh?.isMesh && event.uv) {
    const target = artworkTargetForHit(mesh);
    if (target) {
      return {
        mesh,
        target,
        point: normalizedPointFromUv(mesh, event.uv),
      };
    }
  }

  return null;
}

function barycentricUv(
  p: Vector2,
  a: Vector2,
  b: Vector2,
  c: Vector2,
) {
  const v0 = b.clone().sub(a);
  const v1 = c.clone().sub(a);
  const v2 = p.clone().sub(a);
  const d00 = v0.dot(v0);
  const d01 = v0.dot(v1);
  const d11 = v1.dot(v1);
  const d20 = v2.dot(v0);
  const d21 = v2.dot(v1);
  const denom = d00 * d11 - d01 * d01;
  if (Math.abs(denom) < 1e-8) return null;
  const v = (d11 * d20 - d01 * d21) / denom;
  const w = (d00 * d21 - d01 * d20) / denom;
  const u = 1 - v - w;
  if (u < -0.02 || v < -0.02 || w < -0.02) return null;
  return { u, v, w };
}

function pointForLayerOnMesh(mesh: Mesh, layer: RashguardArtworkLayer) {
  const position = mesh.geometry.attributes.position;
  const uv = mesh.geometry.attributes.uv;
  if (!position || !uv) return null;

  const bounds = uvBoundsForMesh(mesh);
  const targetUv = new Vector2(
    bounds.minU + layer.x * bounds.width,
    bounds.minV + layer.y * bounds.height,
  );
  const index = mesh.geometry.index;
  const triCount = index ? index.count / 3 : position.count / 3;
  const vertexIndex = (tri: number, corner: number) =>
    index ? index.getX(tri * 3 + corner) : tri * 3 + corner;

  for (let tri = 0; tri < triCount; tri++) {
    const i0 = vertexIndex(tri, 0);
    const i1 = vertexIndex(tri, 1);
    const i2 = vertexIndex(tri, 2);
    const uv0 = new Vector2(uv.getX(i0), uv.getY(i0));
    const uv1 = new Vector2(uv.getX(i1), uv.getY(i1));
    const uv2 = new Vector2(uv.getX(i2), uv.getY(i2));
    const bary = barycentricUv(targetUv, uv0, uv1, uv2);
    if (!bary) continue;

    const p0 = new Vector3().fromBufferAttribute(position, i0);
    const p1 = new Vector3().fromBufferAttribute(position, i1);
    const p2 = new Vector3().fromBufferAttribute(position, i2);
    const local = p0
      .multiplyScalar(bary.u)
      .add(p1.multiplyScalar(bary.v))
      .add(p2.multiplyScalar(bary.w));
    mesh.updateWorldMatrix(true, false);
    return mesh.localToWorld(local);
  }

  let closestIndex = 0;
  let closestDistance = Infinity;
  for (let i = 0; i < uv.count; i++) {
    const distance = targetUv.distanceTo(new Vector2(uv.getX(i), uv.getY(i)));
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = i;
    }
  }
  const local = new Vector3().fromBufferAttribute(position, closestIndex);
  mesh.updateWorldMatrix(true, false);
  return mesh.localToWorld(local);
}

function findArtworkTargetMesh(
  root: Group,
  target: RashguardArtworkTarget,
) {
  let found: Mesh | null = null;
  root.traverse((obj) => {
    if (found) return;
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    if (mesh.userData.rashguardStitchingOverlay) return;
    if (artworkTargetForHit(mesh) === target) found = mesh;
  });
  return found;
}

function controlPositionForLayer(
  group: Group | null,
  root: Group,
  layer: RashguardArtworkLayer | undefined,
) {
  if (!group || !layer) return null;
  group.updateWorldMatrix(true, true);
  root.updateWorldMatrix(true, true);
  const mesh = findArtworkTargetMesh(root, layer.target);
  if (!mesh) return null;
  const worldPoint = pointForLayerOnMesh(mesh, layer);
  if (!worldPoint) return null;
  return group.worldToLocal(worldPoint.clone().add(new Vector3(0, 0.04, 0)));
}

export const RashguardGlbModel = memo(() => {
  const { scene } = useGLTF(RASHGUARD_MODEL_URL) as unknown as { scene: Group };
  const { scene: stitchSource } = useGLTF(
    RASHGUARD_STITCH_GRAFT_URL,
  ) as unknown as { scene: Group };
  const { camera } = useThree();
  const {
    partColors,
    artworkLayers,
    selectedArtworkLayerId,
    cameraView,
    setSelectedPanel,
    updateArtworkLayer,
    selectArtworkLayer,
    duplicateArtworkLayer,
    removeArtworkLayer,
    setArtworkDragging,
    setArtworkTargetMeshes,
  } = useRashguardState();
  const groupRef = useRef<Group | null>(null);
  const draggingArtworkLayerIdRef = useRef<string | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const resizingArtworkRef = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startY: number;
    startScale: number;
    element: Element | null;
    moved: boolean;
  } | null>(null);
  const rotatingArtworkRef = useRef<{
    id: string;
    pointerId: number;
    startX: number;
    startRotation: number;
    element: Element | null;
    moved: boolean;
  } | null>(null);
  const suppressResizeClickRef = useRef(false);
  const suppressRotateClickRef = useRef(false);
  const [actualArtworkCameraView, setActualArtworkCameraView] =
    useState<ArtworkCameraView>(() =>
      artworkCameraViewFromPosition(camera.position),
  );

  const selectedArtworkLayer = artworkLayers.find(
    (layer) => layer.id === selectedArtworkLayerId,
  );

  const cloned = useMemo(() => {
    const next = scene.clone(true);

    // The body may be exported Z-up (CLO's Axis Conversion varies between
    // exports) while the camera + grafted stitch are Y-up. Auto-detect and bake
    // a −90° X rotation into the body geometry so it stands upright and the
    // stitch lines up. (No-op when the model is already Y-up.)
    const bodyBox = new Box3().setFromObject(next);
    const bodySize = bodyBox.getSize(new Vector3());
    if (bodySize.z > bodySize.y * 1.2) {
      next.traverse((obj) => {
        const mesh = obj as Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry = mesh.geometry.clone();
        mesh.geometry.rotateX(-Math.PI / 2);
      });
    }

    next.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      if (mesh.userData.rashguardStitchingOverlay) return;
      if (artworkTargetForMesh(mesh) || isInsideLabelTargetMesh(mesh)) {
        mesh.visible = true;
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.renderOrder = 12;
        mesh.frustumCulled = false;
        return;
      }
      if (
        RASHGUARD_DECORATIVE_MESH_NAMES.has(mesh.name) ||
        RASHGUARD_DECORATIVE_MESH_NAMES.has(mesh.geometry?.name ?? '')
      ) {
        mesh.visible = false;
        return;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((mat) => mat.clone());
      } else if (mesh.material) {
        mesh.material = (mesh.material as MeshStandardMaterial).clone();
      }
    });

    // Graft the real ribbon-stitch geometry from the proven export onto this
    // body. The two share a coordinate frame, so the stitch lands on the seams.
    stitchSource.updateMatrixWorld(true);
    stitchSource.traverse((obj) => {
      const m = obj as Mesh;
      if (!m.isMesh) return;
      if (!/topstitch|coverlock|stitch/i.test(m.name)) return;
      const grafted = new Mesh(
        m.geometry,
        Array.isArray(m.material)
          ? m.material.map((mat) => mat.clone())
          : (m.material as MeshStandardMaterial).clone(),
      );
      grafted.name = m.name;
      grafted.matrixAutoUpdate = false;
      grafted.matrix.copy(m.matrixWorld); // bake the source world transform
      grafted.castShadow = false;
      grafted.receiveShadow = false;
      grafted.frustumCulled = false;
      grafted.renderOrder = 20;
      next.add(grafted);
    });

    return next;
  }, [scene, stitchSource]);

  const { offset, scale } = useMemo(() => {
    const box = new Box3().setFromObject(cloned);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const desiredHeight = 2.62;
    const nextScale = size.y > 0 ? desiredHeight / size.y : 1;

    return {
      offset: [
        -center.x * nextScale,
        -box.min.y * nextScale,
        -center.z * nextScale,
      ] as [number, number, number],
      scale: nextScale,
    };
  }, [cloned]);

  useEffect(() => {
    cloned.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      if (mesh.userData.rashguardStitchingOverlay) return;
      if (targetPartForMesh(mesh) || isInsideLabelTargetMesh(mesh)) return;
      const part = partForMesh(mesh);
      if (!part) return;
      ensureGroupedStitchingMaterial(mesh);
      ensureUniqueMaterialForMesh(mesh);
      ensureStitchingOverlayMesh(
        mesh,
        new Color(renderHexFor(partColors.stitching)),
      );
      const apply = (mat: MeshStandardMaterial) => {
        const overridePart = mat.userData.rashguardPartOverride as
          | RashguardPart
          | undefined;
        const materialPart = overridePart ?? part;
        const target = new Color(renderHexFor(partColors[materialPart]));
        if (mat.color) {
          mat.color.copy(target);
          mat.opacity = 1;
          mat.transparent = false;
          mat.depthTest = true;
          if (materialPart === 'stitching') {
            // Real 3D thread geometry (solid tubes, no alpha tile): render
            // opaque, write depth, and pull slightly forward so it sits cleanly
            // on the seam without z-fighting the body.
            mat.transparent = false;
            mat.depthTest = true;
            mat.depthWrite = true;
            mat.polygonOffset = true;
            mat.polygonOffsetFactor = -2;
            mat.polygonOffsetUnits = -2;
            mat.side = FrontSide;
            mesh.renderOrder = Math.max(mesh.renderOrder, 40);
          }
          mat.needsUpdate = true;
        }
      };
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => apply(mat as MeshStandardMaterial));
      } else if (mesh.material) {
        apply(mesh.material as MeshStandardMaterial);
      }
    });
  }, [cloned, partColors]);

  // Tint each lining shell to a light ~25% of its outer panel's colour — the
  // faded interior visible at the hems, cuffs and neck.
  useEffect(() => {
    const white = new Color(0xffffff);
    cloned.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      const part = liningPartForMesh(mesh);
      if (!part) return;
      const faded = new Color(renderHexFor(partColors[part])).lerp(
        white,
        1 - INSIDE_PRINT_STRENGTH,
      );
      const apply = (mat: MeshStandardMaterial) => {
        if (mat.map) {
          mat.map = null;
          mat.needsUpdate = true;
        }
        mat.color.copy(faded);
        // Render the lining shell BACK faces only: it shows on the interior
        // (neck/cuffs) but is culled where it would poke through the outer
        // panels at the curved side seams (which caused a washed "transparent"
        // strip). This model's single combined lining sits very close to the
        // shell, so without this it z-fights/pokes through.
        mat.side = BackSide;
        mat.needsUpdate = true;
        mesh.visible = true;
        mesh.renderOrder = 1;
      };
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((mat) => apply(mat as MeshStandardMaterial));
      } else if (mesh.material) {
        apply(mesh.material as MeshStandardMaterial);
      }
    });
  }, [cloned, partColors]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    let cancelled = false;
    const targetMeshes: Array<{
      mesh: Mesh;
      target: RashguardArtworkTarget;
    }> = [];
    const garmentMeshes: Array<{
      mesh: Mesh;
      target: RashguardArtworkTarget;
    }> = [];

    cloned.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      if (mesh.userData.rashguardStitchingOverlay) return;
      const target = artworkTargetForMesh(mesh);
      if (target && !isInsideLabelTargetMesh(mesh)) {
        targetMeshes.push({ mesh, target });
        return;
      }
      if (targetPartForMesh(mesh) || isInsideLabelTargetMesh(mesh)) return;
      const part = partForMesh(mesh);
      if (part && isArtworkPart(part)) garmentMeshes.push({ mesh, target: part });
    });

    targetMeshes.forEach(({ mesh, target }) => {
      const previous = mesh.material;
      if (Array.isArray(previous)) {
        previous.forEach((mat) => {
          if (mat.userData.rashguardCanvasMaterial) mat.dispose();
        });
      } else if (previous?.userData.rashguardCanvasMaterial) {
        const previousCanvasMaterial = previous as MeshBasicMaterial;
        previousCanvasMaterial.map?.dispose();
        previousCanvasMaterial.dispose();
      }
      const material = makeInvisibleHitTargetMaterial();
      material.userData.rashguardCanvasMaterial = true;
      mesh.material = material;
      mesh.visible = true;
      mesh.renderOrder = 12;
      mesh.frustumCulled = false;
    });

    // Group garment primitives by zone: build each zone's colour/artwork canvas
    // ONCE and share the texture across that zone's primitives. This model
    // splits every panel into 3 primitives, so the old per-mesh build rebuilt a
    // 4096² canvas + texture 3× per panel on each colour change — the lag.
    const garmentByTarget = new Map<RashguardArtworkTarget, Mesh[]>();
    garmentMeshes.forEach(({ mesh, target }) => {
      const list = garmentByTarget.get(target);
      if (list) list.push(mesh);
      else garmentByTarget.set(target, [mesh]);
    });

    garmentByTarget.forEach((meshes, target) => {
      void createArtworkCanvasTexture(
        meshes[0],
        target,
        artworkLayers,
        renderHexFor(partColors[target]),
      ).then((texture) => {
          if (cancelled) {
            texture?.dispose();
            return;
          }

          const hasArtwork = artworkLayers.some(
            (layer) => layer.visible && layer.target === target,
          );
          const hasFixedLogo = target === 'back';
          const applyBakedMaterial = (mat: MeshStandardMaterial) => {
            const overridePart = mat.userData.rashguardPartOverride as
              | RashguardPart
              | undefined;
            if (overridePart === 'stitching') return mat;
            if (mat.userData.rashguardCanvasMaterial) {
              mat.map?.dispose();
            }
            const baked = mat.clone();
            baked.map = texture;
            baked.color.set('#ffffff');
            baked.transparent = false;
            baked.opacity = 1;
            baked.depthTest = true;
            baked.depthWrite = true;
            baked.polygonOffset = false;
            baked.side = FrontSide;
            baked.toneMapped = true;
            baked.userData.rashguardCanvasMaterial = true;
            baked.userData.rashguardBakedArtwork = hasArtwork || hasFixedLogo;
            baked.needsUpdate = true;
            return baked;
          };

          meshes.forEach((mesh) => {
            const previous = mesh.material;
            // Build the baked material(s) first (applyBakedMaterial frees the old
            // shared texture once, before the new one is assigned)…
            if (Array.isArray(mesh.material)) {
              mesh.material = mesh.material.map((mat) =>
                applyBakedMaterial(mat as MeshStandardMaterial),
              );
            } else if (mesh.material) {
              mesh.material = applyBakedMaterial(
                mesh.material as MeshStandardMaterial,
              );
            }
            // …then dispose the replaced material objects.
            if (Array.isArray(previous)) {
              previous.forEach((mat) => {
                if (mat.userData.rashguardCanvasMaterial) mat.dispose();
              });
            } else if (
              previous !== mesh.material &&
              previous?.userData.rashguardCanvasMaterial
            ) {
              (previous as MeshBasicMaterial).dispose();
            }
            mesh.visible = true;
            mesh.renderOrder = 0;
            mesh.frustumCulled = false;
          });
        });
    });

    return () => {
      cancelled = true;
    };
  }, [artworkLayers, cameraView, cloned, partColors]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    let cancelled = false;
    const insideLabelMeshes: Mesh[] = [];

    cloned.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      if (isInsideLabelTargetMesh(mesh)) insideLabelMeshes.push(mesh);
    });

    insideLabelMeshes.forEach((mesh) => {
      void createInsideLabelCanvasTexture(mesh).then((texture) => {
        if (cancelled) {
          texture?.dispose();
          return;
        }

        const previous = mesh.material;
        if (!Array.isArray(previous) && previous?.userData.rashguardCanvasMaterial) {
          const previousCanvasMaterial = previous as MeshBasicMaterial;
          previousCanvasMaterial.map?.dispose();
          previousCanvasMaterial.dispose();
        }

        const material = new MeshBasicMaterial({
          map: texture,
          transparent: true,
          opacity: 1,
          depthTest: true,
          depthWrite: false,
          polygonOffset: false,
          side: BackSide,
          toneMapped: false,
          alphaTest: 0.01,
        });
        material.userData.rashguardCanvasMaterial = true;
        mesh.material = material;
        mesh.visible = cameraView === 'front';
        mesh.renderOrder = 13;
        mesh.frustumCulled = false;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [cameraView, cloned]);

  useFrame(() => {
    const nextCameraView = cameraSideFromZ(camera.position.z);
    const nextArtworkCameraView = artworkCameraViewFromPosition(camera.position);
    setActualArtworkCameraView((prev) =>
      prev === nextArtworkCameraView ? prev : nextArtworkCameraView,
    );
    cloned.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      if (mesh.userData.rashguardStitchingOverlay) return;
      if (isInsideLabelTargetMesh(mesh)) {
        mesh.visible = nextCameraView === 'front' && cameraView === 'front';
        return;
      }
      const target = artworkTargetForMesh(mesh);
      if (!target) return;
      mesh.visible = true;
    });
  });

  useEffect(() => {
    const targets: Partial<Record<RashguardArtworkTarget, Mesh>> = {};
    cloned.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      if (mesh.userData.rashguardStitchingOverlay) return;
      const target = artworkTargetForMesh(mesh);
      if (target) targets[target] = mesh;
    });
    setArtworkTargetMeshes(targets);

    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__rashguardTargets =
        Object.fromEntries(
          Object.entries(targets).map(([target, mesh]) => [target, mesh.name]),
        );
    }
  }, [cloned, setArtworkTargetMeshes]);

  const selectedControlPosition = controlPositionForLayer(
    groupRef.current,
    cloned,
    selectedArtworkLayer,
  );
  const shouldShowSelectedOverlay =
    Boolean(selectedArtworkLayer?.visible) &&
    !selectedArtworkLayer?.placementPending &&
    Boolean(
      selectedArtworkLayer &&
        shouldShowControlsForCamera(
          selectedArtworkLayer.target,
          actualArtworkCameraView,
        ),
    );
  const selectedOverlaySize = selectedArtworkLayer
    ? (() => {
        if (selectedArtworkLayer.kind === 'text') {
          // Match the on-screen box to the real text: grow wider with letters.
          // fontSize cancels out, so any reference size gives the right aspect.
          const ref = 100;
          const text = selectedArtworkLayer.text?.trim() || 'TEXT';
          const measured = measureTextWidth(
            text,
            ref,
            fontStackForLayer(selectedArtworkLayer),
          );
          const aspect = measured / (ref * 1.2);
          const height = Math.max(
            32,
            Math.min(120, 58 * selectedArtworkLayer.scale),
          );
          return {
            width: Math.max(60, Math.min(520, height * aspect)),
            height,
          };
        }
        const aspect =
          selectedArtworkLayer.imageWidth /
          Math.max(1, selectedArtworkLayer.imageHeight);
        const width = Math.max(
          78,
          Math.min(190, 116 * selectedArtworkLayer.scale),
        );
        return {
          width,
          height: Math.max(54, Math.min(170, width / Math.max(0.1, aspect))),
        };
      })()
    : null;

  const beginDragLayer = (event: ThreeEvent<PointerEvent>) => {
    const hit = artworkTargetHitFromEvent(event);
    if (!hit) {
      setSelectedPanel('garment');
      selectArtworkLayer(null);
      return;
    }

    if (selectedArtworkLayer?.placementPending) {
      event.stopPropagation();
      updateArtworkLayer(selectedArtworkLayer.id, {
        target: hit.target,
        x: hit.point.x,
        y: hit.point.y,
        placementPending: false,
      });
      return;
    }

    const layer = topArtworkLayerAtPoint(
      artworkLayers,
      hit.target,
      hit.point,
      canvasSizeForUvBounds(uvBoundsForMesh(hit.mesh)),
    );
    if (!layer) {
      setSelectedPanel('artwork');
      selectArtworkLayer(null);
      return;
    }

    event.stopPropagation();
    selectArtworkLayer(layer.id);
    if (layer.locked) return;
    draggingArtworkLayerIdRef.current = layer.id;
    dragOffsetRef.current = {
      x: layer.x - hit.point.x,
      y: layer.y - hit.point.y,
    };
    setArtworkDragging(true);
    (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
  };

  const dragLayer = (event: ThreeEvent<PointerEvent>) => {
    const layerId = draggingArtworkLayerIdRef.current;
    if (!layerId) return;
    const activeLayer = artworkLayers.find((layer) => layer.id === layerId);
    if (!activeLayer || activeLayer.locked) return;
    const hit = artworkTargetHitFromEvent(event);
    if (!hit) return;
    event.stopPropagation();
    const dragOffset = dragOffsetRef.current ?? { x: 0, y: 0 };
    updateArtworkLayer(layerId, {
      target: hit.target,
      x: hit.point.x + dragOffset.x,
      y: hit.point.y + dragOffset.y,
    });
  };

  const endDragLayer = (event: ThreeEvent<PointerEvent>) => {
    if (!draggingArtworkLayerIdRef.current) return;
    event.stopPropagation();
    draggingArtworkLayerIdRef.current = null;
    dragOffsetRef.current = null;
    setArtworkDragging(false);
    (event.target as Element | null)?.releasePointerCapture?.(event.pointerId);
  };

  const resizeArtworkFromPointer = (
    pointerId: number,
    clientX: number,
    clientY: number,
  ) => {
    const resize = resizingArtworkRef.current;
    if (!resize || resize.pointerId !== pointerId) return;
    const delta = clientX - resize.startX + clientY - resize.startY;
    if (Math.abs(delta) > 3) resize.moved = true;
    const nextScale = Math.min(
      4,
      Math.max(0.2, resize.startScale * Math.exp(delta / 90)),
    );
    updateArtworkLayer(resize.id, { scale: nextScale });
  };

  const endResizeArtwork = (pointerId: number) => {
    const resize = resizingArtworkRef.current;
    if (!resize || resize.pointerId !== pointerId) return;
    suppressResizeClickRef.current = resize.moved;
    resize.element?.releasePointerCapture?.(pointerId);
    resizingArtworkRef.current = null;
    setArtworkDragging(false);
  };

  const rotateArtworkFromPointer = (pointerId: number, clientX: number) => {
    const rotate = rotatingArtworkRef.current;
    if (!rotate || rotate.pointerId !== pointerId) return;
    const delta = clientX - rotate.startX;
    if (Math.abs(delta) > 3) rotate.moved = true;
    updateArtworkLayer(rotate.id, {
      rotationDeg: rotate.startRotation + delta * 0.7,
    });
  };

  const endRotateArtwork = (pointerId: number) => {
    const rotate = rotatingArtworkRef.current;
    if (!rotate || rotate.pointerId !== pointerId) return;
    suppressRotateClickRef.current = rotate.moved;
    rotate.element?.releasePointerCapture?.(pointerId);
    rotatingArtworkRef.current = null;
    setArtworkDragging(false);
  };

  return (
    <group
      ref={groupRef}
      name="rashguard-garment"
      position={offset}
      scale={scale}
      onPointerDown={beginDragLayer}
      onPointerMove={dragLayer}
      onPointerUp={endDragLayer}
      onPointerCancel={endDragLayer}
    >
      <primitive object={cloned} />
      {selectedArtworkLayer &&
      selectedControlPosition &&
      selectedOverlaySize &&
      shouldShowSelectedOverlay ? (
        <Html
          position={selectedControlPosition}
          center
          zIndexRange={[40, 0]}
          className="pointer-events-none select-none"
        >
          <div
            className="relative"
            style={{
              width: selectedOverlaySize.width,
              height: selectedOverlaySize.height,
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerMove={(event) => event.stopPropagation()}
          >
            <div className="absolute inset-0 border-2 border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" />
            <button
              type="button"
              className="pointer-events-auto absolute -left-9 -top-9 flex h-8 w-8 items-center justify-center rounded border border-[#d6d6d6] bg-white text-[#444] shadow-md hover:bg-[#f4f4f4]"
              title={selectedArtworkLayer.locked ? 'Unlock' : 'Lock'}
              aria-label={selectedArtworkLayer.locked ? 'Unlock' : 'Lock'}
              onClick={(event) => {
                event.stopPropagation();
                updateArtworkLayer(selectedArtworkLayer.id, {
                  locked: !selectedArtworkLayer.locked,
                });
              }}
            >
              {selectedArtworkLayer.locked ? (
                <Lock className="h-4 w-4" />
              ) : (
                <Unlock className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              className="pointer-events-auto absolute -right-9 -top-9 flex h-8 w-8 cursor-ew-resize items-center justify-center rounded border border-[#d6d6d6] bg-white text-[#444] shadow-md hover:bg-[#f4f4f4] disabled:cursor-not-allowed disabled:opacity-40"
              title="Rotate"
              aria-label="Rotate"
              disabled={selectedArtworkLayer.locked}
              onPointerDown={(event) => {
                if (selectedArtworkLayer.locked) return;
                event.stopPropagation();
                event.preventDefault();
                const element = event.currentTarget;
                element.setPointerCapture?.(event.pointerId);
                rotatingArtworkRef.current = {
                  id: selectedArtworkLayer.id,
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startRotation: selectedArtworkLayer.rotationDeg,
                  element,
                  moved: false,
                };
                setArtworkDragging(true);
              }}
              onPointerMove={(event) => {
                event.stopPropagation();
                if (!rotatingArtworkRef.current) return;
                event.preventDefault();
                rotateArtworkFromPointer(event.pointerId, event.clientX);
              }}
              onPointerUp={(event) => {
                event.stopPropagation();
                endRotateArtwork(event.pointerId);
              }}
              onPointerCancel={(event) => {
                event.stopPropagation();
                endRotateArtwork(event.pointerId);
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (suppressRotateClickRef.current) {
                  suppressRotateClickRef.current = false;
                  return;
                }
                updateArtworkLayer(selectedArtworkLayer.id, {
                  rotationDeg: selectedArtworkLayer.rotationDeg + 15,
                });
              }}
            >
              <RotateCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="pointer-events-auto absolute -bottom-9 -left-9 flex h-8 w-8 items-center justify-center rounded border border-[#d6d6d6] bg-white text-[#444] shadow-md hover:bg-[#f4f4f4]"
              title="Delete"
              aria-label="Delete"
              onClick={(event) => {
                event.stopPropagation();
                removeArtworkLayer(selectedArtworkLayer.id);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="pointer-events-auto absolute -bottom-9 left-1/2 flex h-8 min-w-10 -translate-x-1/2 items-center justify-center rounded border border-[#d6d6d6] bg-white px-1.5 text-sm font-bold text-[#555] shadow-md hover:bg-[#f4f4f4]"
              title="Duplicate"
              aria-label="Duplicate"
              onClick={(event) => {
                event.stopPropagation();
                duplicateArtworkLayer(selectedArtworkLayer.id);
              }}
            >
              x2
            </button>
            <button
              type="button"
              className="pointer-events-auto absolute -bottom-9 -right-9 flex h-8 w-8 cursor-nwse-resize items-center justify-center rounded border border-[#d6d6d6] bg-white text-[#444] shadow-md hover:bg-[#f4f4f4] disabled:cursor-not-allowed disabled:opacity-40"
              title="Resize"
              aria-label="Resize"
              disabled={selectedArtworkLayer.locked}
              onPointerDown={(event) => {
                if (selectedArtworkLayer.locked) return;
                event.stopPropagation();
                event.preventDefault();
                const element = event.currentTarget;
                element.setPointerCapture?.(event.pointerId);
                resizingArtworkRef.current = {
                  id: selectedArtworkLayer.id,
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  startScale: selectedArtworkLayer.scale,
                  element,
                  moved: false,
                };
                setArtworkDragging(true);
              }}
              onPointerMove={(event) => {
                event.stopPropagation();
                if (!resizingArtworkRef.current) return;
                event.preventDefault();
                resizeArtworkFromPointer(
                  event.pointerId,
                  event.clientX,
                  event.clientY,
                );
              }}
              onPointerUp={(event) => {
                event.stopPropagation();
                endResizeArtwork(event.pointerId);
              }}
              onPointerCancel={(event) => {
                event.stopPropagation();
                endResizeArtwork(event.pointerId);
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (suppressResizeClickRef.current) {
                  suppressResizeClickRef.current = false;
                  return;
                }
                updateArtworkLayer(selectedArtworkLayer.id, {
                  scale: selectedArtworkLayer.scale + 0.1,
                });
              }}
            >
              <Expand className="h-4 w-4" />
            </button>
          </div>
        </Html>
      ) : null}
    </group>
  );
});

RashguardGlbModel.displayName = 'RashguardGlbModel';

useGLTF.preload(RASHGUARD_MODEL_URL);
useGLTF.preload(RASHGUARD_STITCH_GRAFT_URL);
