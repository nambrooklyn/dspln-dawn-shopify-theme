import { currentGiProductConfig } from '../shared/gi-product-config';

// Hardcoded gi configurator constants for v1.
// Once the real .glb arrives and the catalog row has a configuratorSlug,
// some of these may move to the catalog table. For now they live in code.

export const GI_PARTS = ['jacket', 'pants', 'belt'] as const;
export type GiPart = (typeof GI_PARTS)[number];

export const GI_PART_LABELS: Record<GiPart, string> = {
  jacket: 'Jacket',
  pants: 'Pants',
  belt: 'Belt',
};

export const GI_DEFAULT_COLORS: Record<GiPart, string> = {
  jacket: '#ffffff',
  pants: '#ffffff',
  belt: '#ffffff',
};

/**
 * Per-part prices shown in the right sidebar Price summary. Mirrors the
 * D2C reference labels ("Add Kimono (+$55)", "Add Belt (+$15)",
 * "Add Pant (+$45)").
 */
export const GI_PART_PRICES: Record<GiPart, number> = {
  jacket: 55,
  pants: 45,
  belt: 28,
};

export const GI_PART_DISPLAY: Record<GiPart, string> = {
  jacket: 'Kimono',
  pants: 'Pant',
  belt: 'Belt',
};

/**
 * The 10 preset color swatches shown across every "Color" section
 * (Kimono Body, Lapel, Reinforcements, Stitching, etc.) and reused
 * across Belt and Pant sections.
 * Hex values are eyeball estimates from the D2C reference and will be
 * tightened once Nam confirms exact brand hexes.
 */
/**
 * Each swatch carries TWO hexes:
 * - `hex`: the small swatch chip shown in the UI grid. Stays vivid so
 *   the picker reads clearly at thumbnail size.
 * - `renderHex`: the color applied to the actual 3D fabric. Slightly
 *   muted from `hex` so the lighting still produces shape and folds
 *   (pure #000 black absorbs all light and goes flat).
 *
 * If both hexes match we omit `renderHex` and use `hex` for both.
 */
/**
 * The 10 preset swatches. `hex` is the chip shown in the UI grid —
 * those stay at the original vibrant values you approved early on so
 * the picker reads clearly. `renderHex` is the toned-down value
 * actually applied to the 3D fabric so the rendered gi looks realistic
 * (avoids pure-black absorbing all light, avoids over-saturated bright
 * tones, matches the D2C reference).
 *
 * If a swatch has no renderHex, the UI hex is used for both.
 */
export const GI_COLOR_SWATCHES = [
  { name: 'White', hex: '#ffffff' },
  { name: 'Royal Blue', hex: '#2a47e8' },
  { name: 'Black', hex: '#000000', renderHex: '#3a3a3a' },
  { name: 'Olive', hex: '#3a4221', renderHex: '#4f4622' },
  { name: 'Khaki', hex: '#bfb58a', renderHex: '#928f78' },
  { name: 'Gray', hex: '#787878' },
  { name: 'Navy', hex: '#1a2540', renderHex: '#2c3a6e' },
  { name: 'Red', hex: '#a82828', renderHex: '#6e2222' },
  { name: 'Orange', hex: '#be5c23' },
  { name: 'Brown', hex: '#7a4f00', renderHex: '#4a3000' },
] as const;

export const BELT_COLOR_SWATCHES = [
  { name: 'White', hex: '#ffffff' },
  { name: 'Blue', hex: '#2a47e8' },
  { name: 'Purple', hex: '#5b2c83', renderHex: '#4b256f' },
  { name: 'Brown', hex: '#7a4f00', renderHex: '#4a3000' },
  { name: 'Black', hex: '#000000', renderHex: '#111111' },
] as const;

export const BELT_FONT_OPTIONS = [
  {
    name: 'Arial Black',
    css: 'Arial Black, Impact, sans-serif',
  },
  {
    name: 'Impact',
    css: 'Impact, Haettenschweiler, Arial Narrow Bold, sans-serif',
  },
  {
    name: 'Helvetica Bold',
    css: 'Helvetica Neue, Helvetica, Arial, sans-serif',
  },
  {
    name: 'Georgia Bold',
    css: 'Georgia, Times New Roman, serif',
  },
  {
    name: 'Courier Bold',
    css: 'Courier New, Courier, monospace',
  },
] as const;

export type BeltFontName = (typeof BELT_FONT_OPTIONS)[number]['name'];

export function fontCssForBeltFont(fontName: string): string {
  return (
    BELT_FONT_OPTIONS.find((font) => font.name === fontName)?.css ??
    BELT_FONT_OPTIONS[0].css
  );
}

/**
 * Returns the color to actually apply to the 3D material for a given
 * swatch hex. Falls back to the input hex for any swatch that doesn't
 * specify an override.
 */
export function renderHexFor(hex: string): string {
  const swatch = [...GI_COLOR_SWATCHES, ...BELT_COLOR_SWATCHES].find(
    (s) => s.hex.toLowerCase() === hex.toLowerCase(),
  );
  // @ts-expect-error renderHex is optional on the swatch tuple
  return swatch?.renderHex ?? hex;
}

export type GiColorName = (typeof GI_COLOR_SWATCHES)[number]['name'];

/**
 * Resolve a hex value to a swatch name (case-insensitive). Used to
 * display "WHITE" / "ROYAL BLUE" labels next to section titles.
 * Returns null if the color isn't a preset (e.g. custom hex).
 */
export function nameForHex(hex: string): GiColorName | null {
  const target = hex.toLowerCase();
  const found = GI_COLOR_SWATCHES.find((s) => s.hex.toLowerCase() === target);
  return found ? found.name : null;
}

export function nameForBeltHex(hex: string): string | null {
  const target = hex.toLowerCase();
  const found = BELT_COLOR_SWATCHES.find((s) => s.hex.toLowerCase() === target);
  return found ? found.name : null;
}

/**
 * Kimono sub-parts that can be colored independently. Each sub-part
 * maps to one or more meshes in the .glb (see KIMONO_MESH_TO_SUBPART).
 */
export const KIMONO_SUBPARTS = [
  'body',
  'lapel',
  'reinforcement',
  'stitching',
] as const;
export type KimonoSubPart = (typeof KIMONO_SUBPARTS)[number];

export const KIMONO_SUBPART_LABEL: Record<KimonoSubPart, string> = {
  body: 'Kimono Body Color',
  lapel: 'Kimono Lapel Color',
  reinforcement: 'Kimono Reinforcements Color',
  stitching: 'Kimono Stitching Color',
};

export const KIMONO_SUBPART_DEFAULT: Record<KimonoSubPart, string> = {
  body: '#ffffff',
  lapel: '#ffffff',
  reinforcement: '#ffffff',
  stitching: '#ffffff',
};

/**
 * Map of mesh name → kimono sub-part. Any kimono mesh not in this map
 * (e.g. embroidery, inside label, lapel labels) keeps its original
 * material — these are baked logos / brand marks that shouldn't be
 * recolored by the merchant.
 */
/**
 * Named logo placement slots on the kimono. Each slot has a fixed
 * anchor (position, surface normal, plane rotation) so the merchant
 * just uploads a logo and it lands in the right spot.
 *
 * Anchor coords are in world space (the model has been auto-scaled to
 * ~2.5 units tall and centered at origin by gi-glb-model.tsx).
 */
export const KIMONO_LOGO_SLOTS = [
  'left-chest',
  'left-sleeve',
  'right-sleeve',
  'back',
  'back-skirt',
] as const;

/** Slots that only appear in studio mode (?studio=1) — used for special
 *  customer requests. Customers still see artwork placed there when they
 *  open a shared design link; they just don't get the upload control. */
export const STUDIO_ONLY_KIMONO_LOGO_SLOTS: readonly KimonoLogoSlot[] = [
  'back-skirt',
];
export type KimonoLogoSlot = (typeof KIMONO_LOGO_SLOTS)[number];

export const KIMONO_LOGO_SLOT_LABEL: Record<KimonoLogoSlot, string> = {
  'left-chest': 'Logo on Left Chest',
  'left-sleeve': 'Logo on Left Sleeve',
  'right-sleeve': 'Logo on Right Sleeve',
  back: 'Big Logo on Back',
  'back-skirt': 'Logo Below Belt (Back)',
};

export interface KimonoLogoAnchor {
  position: [number, number, number];
  /** plane rotation (Euler XYZ in radians). The plane's default normal
   *  is +Z; rotation orients it so the plane faces outward from the
   *  body surface. */
  rotation: [number, number, number];
  /** Default size in "inches" — gets translated to world units inside
   *  LayerDecal (1 in ≈ 0.1 world unit). */
  defaultSizeIn: { w: number; h: number };
}

export const KIMONO_LOGO_ANCHORS: Record<KimonoLogoSlot, KimonoLogoAnchor> = {
  // Wearer's left chest = camera's RIGHT in the front view.
  'left-chest': {
    position: [0.215, 2, 0.42],
    rotation: [0, 0.5, -Math.PI / 18],
    defaultSizeIn: { w: 1.95, h: 1.95 },
  },
  // Wearer's left sleeve = camera's right side. Uses the same square
  // print box as the left chest, projected onto the outside bicep.
  'left-sleeve': {
    position: [0.78, 1.72, -0.08],
    rotation: [0, Math.PI / 2.35, 0],
    defaultSizeIn: { w: 1.95, h: 1.95 },
  },
  // Wearer's right sleeve = camera's left side.
  'right-sleeve': {
    position: [-0.78, 1.72, -0.08],
    rotation: [0, -Math.PI / 2.35, 0],
    defaultSizeIn: { w: 1.95, h: 1.95 },
  },
  // Square print area on the flatter upper-back panel. It needs to stay
  // inside the jacket's waist taper or the lower corners have no surface
  // to project onto.
  back: {
    position: [0, 1.73, -0.42],
    rotation: [0, Math.PI, 0],
    defaultSizeIn: { w: 3.7, h: 3.7 },
  },
  // Wide strip on the back skirt, just below the belt (studio-only
  // placement for special requests). Sits on the draped skirt panel, so
  // it protrudes slightly more than the upper back.
  'back-skirt': {
    // 4.2 in wide: the back panel curves away at the side seams, so a
    // wider strip gets its first/last letters culled by the projector.
    position: [0, 1.43, -0.46],
    rotation: [0, Math.PI, 0],
    defaultSizeIn: { w: 4.2, h: 1.6 },
  },
};

export const KIMONO_MESH_TO_SUBPART: Record<string, KimonoSubPart> = {
  Kimono_Body: 'body',
  Kimono_Lapel: 'lapel',
  Kimono_Reinforcement_1: 'reinforcement',
  Kimono_Reinforcement_2: 'reinforcement',
  Kimono_Reinforcement_3: 'reinforcement',
  Kimono_Reinforcement_4: 'reinforcement',
  Kimono_Stitching_1: 'stitching',
  Kimono_Stitching_2: 'stitching',
  Kimono_Stitching_3: 'stitching',
  Kimono_Lapel_Label_Stitching: 'stitching',
};

export const PANT_SUBPARTS = [
  'body',
  'reinforcement',
  'stitching',
  'drawcord',
] as const;
export type PantSubPart = (typeof PANT_SUBPARTS)[number];

export const PANT_SUBPART_LABEL: Record<PantSubPart, string> = {
  body: 'Pant Body Color',
  reinforcement: 'Pant Reinforcements Color',
  stitching: 'Pant Stitching Color',
  drawcord: 'Pant Drawcord Color',
};

export const PANT_SUBPART_DEFAULT: Record<PantSubPart, string> = {
  body: '#ffffff',
  reinforcement: '#ffffff',
  stitching: '#ffffff',
  drawcord: '#ffffff',
};

export const PANT_MESH_TO_SUBPART: Record<string, PantSubPart> = {
  Pant_Body_1: 'body',
  Pant_Body_2: 'body',
  Pant_Body_3: 'body',
  Pant_Drawcord: 'drawcord',
  Pant_Reinforcements_1: 'reinforcement',
  Pant_Reinforcements_2: 'reinforcement',
  Pants_Stitching_1: 'stitching',
  Pants_Stitching_2: 'stitching',
  Pants_Stitching_3: 'stitching',
  Pants_Stitching_4: 'stitching',
};

export const PANT_LOGO_SLOTS = ['left-pant', 'right-pant'] as const;
export type PantLogoSlot = (typeof PANT_LOGO_SLOTS)[number];

export const PANT_LOGO_SLOT_LABEL: Record<PantLogoSlot, string> = {
  'left-pant': 'Logo on Left Thigh',
  'right-pant': 'Logo on Right Thigh',
};

export const PANT_LOGO_ANCHORS: Record<PantLogoSlot, KimonoLogoAnchor> = {
  // Wearer's left pant leg = camera's right in front view.
  'left-pant': {
    position: [0.235, 1.08, 0.25],
    rotation: [0, 0.16, 0],
    defaultSizeIn: { w: 1.95, h: 1.95 },
  },
  'right-pant': {
    position: [-0.27, 1.08, 0.25],
    rotation: [0, -0.16, 0],
    defaultSizeIn: { w: 1.95, h: 1.95 },
  },
};

export const BELT_EMBROIDERY_DEFAULT = {
  leftEnd: '',
  rightEnd: '',
  leftFont: 'Arial Black' as BeltFontName,
  rightFont: 'Arial Black' as BeltFontName,
  leftThreadColor: '#ffffff',
  rightThreadColor: '#ffffff',
};

export type CameraView =
  | 'front'
  | 'back'
  | 'left'
  | 'right'
  | 'left-belt-end'
  | 'right-belt-end'
  | 'belt-close'
  | 'pants-close'
  | 'lapel-close'
  | 'chest-close'
  | 'left-sleeve-close'
  | 'right-sleeve-close'
  | 'back-close'
  | 'back-skirt-close'
  | 'left-thigh-close'
  | 'right-thigh-close'
  | 'body-close'
  | 'reinforcement-close'
  | 'stitching-close'
  | 'knees-close'
  | 'pant-stitching-close'
  | 'drawcord-close';

// Camera positions for Front/Back tabs. Tuned to frame the full gi
// (head to feet) given the model auto-scales to ~2.5 units tall.
// Target y = 1.25 = exact vertical center of the model so the gi sits
// dead-center in the canvas (not biased high or low).
// Focus views (…-close) frame the area a customization option affects.
// Wearer's left = camera's RIGHT (+x) in the front view — slot names are
// wearer-relative, positions are camera-relative.
export const CAMERA_POSITIONS: Record<CameraView, [number, number, number]> = {
  front: [0, 1.15, 2.0],
  back: [0, 1.15, -2.0],
  left: [-2.0, 1.15, 0],
  right: [2.0, 1.15, 0],
  'left-belt-end': [0.77, 1.19, 1.2],
  'right-belt-end': [-0.77, 1.19, 1.21],
  'belt-close': [0, 1.18, 1.7],
  'pants-close': [-0.75, 1.01, 1.78],
  'lapel-close': [-0.92, 2.22, 1.74],
  'chest-close': [1.04, 1.99, 1.15],
  'left-sleeve-close': [2.35, 2.01, 0.02],
  'right-sleeve-close': [-2.89, 2.2, 0.82],
  'back-close': [-0.07, 2.05, -1.92],
  'back-skirt-close': [0, 1, -2.1],
  'left-thigh-close': [1.3, 0.85, 1.7],
  'right-thigh-close': [-1.3, 0.85, 1.7],
  'body-close': [0.59, 1.78, 2.5],
  'reinforcement-close': [1.28, 0.68, 1.81],
  'stitching-close': [-0.75, 1.83, 0.78],
  'knees-close': [0.79, 0.03, -1.65],
  'pant-stitching-close': [-0.6, 0.89, 0.94],
  'drawcord-close': [0.05, 1.41, 1.15],
};

export const MOBILE_CAMERA_POSITIONS: Record<
  CameraView,
  [number, number, number]
> = {
  front: [0, 1.15, 2.0],
  back: [0, 1.15, -2.0],
  left: [-2.0, 1.15, 0],
  right: [2.0, 1.15, 0],
  'left-belt-end': [0.77, 1.19, 1.2],
  'right-belt-end': [-0.77, 1.19, 1.21],
  'belt-close': [0, 1.18, 1.7],
  'pants-close': [-0.75, 1.01, 1.78],
  'lapel-close': [-0.92, 2.22, 1.74],
  'chest-close': [1.04, 1.99, 1.15],
  'left-sleeve-close': [2.35, 2.01, 0.02],
  'right-sleeve-close': [-2.89, 2.2, 0.82],
  'back-close': [-0.07, 2.05, -1.92],
  'back-skirt-close': [0, 1, -2.1],
  'left-thigh-close': [1.3, 0.85, 1.7],
  'right-thigh-close': [-1.3, 0.85, 1.7],
  'body-close': [0.59, 1.78, 2.5],
  'reinforcement-close': [1.28, 0.68, 1.81],
  'stitching-close': [-0.75, 1.83, 0.78],
  'knees-close': [0.79, 0.03, -1.65],
  'pant-stitching-close': [-0.6, 0.89, 0.94],
  'drawcord-close': [0.05, 1.41, 1.15],
};

/** Camera view-to-view tween duration. Shared by the canvas tween and
 *  the capture flow's settle wait so they can't drift apart. */
export const GI_CAMERA_TWEEN_MS = 800;

export const CAMERA_TARGET: [number, number, number] = [0, 1.15, 0];

export const CAMERA_TARGETS: Record<CameraView, [number, number, number]> = {
  front: CAMERA_TARGET,
  back: CAMERA_TARGET,
  left: CAMERA_TARGET,
  right: CAMERA_TARGET,
  'left-belt-end': [0.15, 1.25, 0.18],
  'right-belt-end': [-0.16, 1.25, 0.18],
  'belt-close': [0, 1.15, 0],
  'pants-close': [0, 0.62, 0],
  'lapel-close': [0, 1.66, 0],
  'chest-close': [0.15, 1.58, 0],
  'left-sleeve-close': [0.4, 1.45, 0],
  'right-sleeve-close': [-0.4, 1.45, 0],
  'back-close': [0, 1.5, 0],
  'back-skirt-close': [0, 0.98, 0],
  'left-thigh-close': [0.22, 0.8, 0],
  'right-thigh-close': [-0.22, 0.8, 0],
  'body-close': [0, 1.4, 0],
  'reinforcement-close': [0.1, 1.3, 0],
  'stitching-close': [0.1, 1.5, 0],
  'knees-close': [0, 0.55, 0],
  'pant-stitching-close': [0.12, 0.72, 0],
  'drawcord-close': [0, 1.08, 0],
};

/**
 * Camera focus per customization option: selecting an option moves the
 * camera to frame the area it affects, so the change is visible without
 * manual orbiting. One map per option family; all feed setCameraView,
 * which tweens (~600ms) and then hands control back to OrbitControls.
 */
export const PART_CAMERA_VIEW: Record<GiPart, CameraView> = {
  jacket: 'front',
  belt: 'belt-close',
  pants: 'pants-close',
};

export const KIMONO_SUBPART_CAMERA_VIEW: Record<KimonoSubPart, CameraView> = {
  body: 'body-close',
  lapel: 'lapel-close',
  reinforcement: 'reinforcement-close',
  stitching: 'stitching-close',
};

export const KIMONO_LOGO_SLOT_CAMERA_VIEW: Record<KimonoLogoSlot, CameraView> = {
  'left-chest': 'chest-close',
  'left-sleeve': 'left-sleeve-close',
  'right-sleeve': 'right-sleeve-close',
  back: 'back-close',
  'back-skirt': 'back-skirt-close',
};

export const PANT_SUBPART_CAMERA_VIEW: Record<PantSubPart, CameraView> = {
  body: 'pants-close',
  reinforcement: 'knees-close',
  stitching: 'pant-stitching-close',
  drawcord: 'drawcord-close',
};

export const PANT_LOGO_SLOT_CAMERA_VIEW: Record<PantLogoSlot, CameraView> = {
  'left-pant': 'left-thigh-close',
  'right-pant': 'right-thigh-close',
};

// Anchor for a logo placed on the jacket chest (front).
// In world space relative to the placeholder gi origin (0,0,0).
export const JACKET_CHEST_ANCHOR = {
  position: [0, 1.6, 0.42] as [number, number, number],
  normal: [0, 0, 1] as [number, number, number],
  defaultSizeIn: { w: 4, h: 4 },
};

// URL of the gi .glb model. For local dev this is served from
// apps/user/public/models. Before production deploy this gets replaced
// by a fetch to /api/configurator-models/gi that returns a signed S3 URL.
// Keeping it as a single constant means the swap is one line.
export const GI_MODEL_URL = currentGiProductConfig().modelUrl;
