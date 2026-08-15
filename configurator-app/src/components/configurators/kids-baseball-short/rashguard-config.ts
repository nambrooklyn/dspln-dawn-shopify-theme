export const RASHGUARD_MODEL_URL =
  '/models/kids-baseball-short.glb?v=20260815b';

// NOTE: no stitch graft. CLO exported this model's topstitching as real mesh
// inside the single GLB (the 44 Topstitch_* meshes), so it ships as ONE GLB and
// the Topstitch meshes colour via the 'stitching' part through the name
// fallback in rashguard-glb-model. Do not re-introduce RASHGUARD_STITCH_GRAFT_URL.
//
// The four fabric panels came out of CLO named after internal lines
// ("Internal Line_44927" …). They are renamed to the human names below during
// asset prep, derived from geometry: lower X = wearer's right, higher Z = front.
// If the model is re-exported from CLO, name the pattern pieces in CLO first —
// the internal-line IDs change every export and would break RASHGUARD_MESH_TO_PART.

export const RASHGUARD_PRODUCT_CONFIG = {
  productName: 'Kids Baseball Short',
  productTitle: 'Custom Kids Baseball Short',
  shopifyProductPath: '/products/custom-kids-baseball-short',
  shopifyProductHandle: 'custom-kids-baseball-short',
  designNamePrefix: 'Kids Baseball Short Design',
  savedDesignIdPrefix: 'kids_baseball_short_saved',
  orderDesignIdPrefix: 'kids_baseball_short_order',
  localStorageKey: 'dspln:kids-baseball-short-designs:v1',
  autoDraftStorageKey: 'dspln:kids-baseball-short-autosave:v1',
  cartStorageKey: 'dspln:kids-baseball-short-test-cart',
  configStoragePrefix: 'dspln:kids-baseball-short-config:',
  netlifyPath: '/configurator/kids-baseball-short',
};

export const RASHGUARD_PARTS = [
  'rightFrontLeg',
  'leftFrontLeg',
  'rightBackLeg',
  'leftBackLeg',
  'stitching',
] as const;
export type RashguardPart = (typeof RASHGUARD_PARTS)[number];

export const RASHGUARD_PART_LABELS: Record<RashguardPart, string> = {
  rightFrontLeg: 'Right Front Leg',
  leftFrontLeg: 'Left Front Leg',
  rightBackLeg: 'Right Back Leg',
  leftBackLeg: 'Left Back Leg',
  stitching: 'Stitching',
};

export const RASHGUARD_DEFAULT_COLORS: Record<RashguardPart, string> = {
  rightFrontLeg: '#ffffff',
  leftFrontLeg: '#ffffff',
  rightBackLeg: '#ffffff',
  leftBackLeg: '#ffffff',
  stitching: '#ffffff',
};

export const RASHGUARD_COLOR_SWATCHES = [
  { name: 'White', hex: '#ffffff' },
  { name: 'Blue', hex: '#0033ff' },
  { name: 'Purple', hex: '#4b256f' },
  { name: 'Brown', hex: '#4a3000' },
  { name: 'Black', hex: '#2c2c2c' },
  { name: 'Khaki', hex: '#928f78' },
  { name: 'Navy', hex: '#25375f' },
  { name: 'Olive', hex: '#4f4622' },
  { name: 'Red', hex: '#762626' },
  { name: 'Orange', hex: '#be5c23' },
] as const;

export function renderHexFor(hex: string): string {
  // One colour everywhere: the swatch hex IS the colour painted on the garment.
  return hex;
}

export function nameForHex(hex: string): string | null {
  const swatch = RASHGUARD_COLOR_SWATCHES.find(
    (item) => item.hex.toLowerCase() === hex.toLowerCase(),
  );
  return swatch?.name ?? null;
}

// Youth sizing — this is a kids garment, so it does not use the adult run.
export const RASHGUARD_SIZE_OPTIONS = [
  'YXS',
  'YS',
  'YM',
  'YL',
  'YXL',
] as const;

export const RASHGUARD_BASE_PRICE = 45;
export const RASHGUARD_LOGO_PRICE = 10;
export const RASHGUARD_BACK_LOGO_PRICE = 25;

export const RASHGUARD_LOGO_SLOTS = [
  'right-front-leg',
  'left-front-leg',
  'right-back-leg',
  'left-back-leg',
] as const;
export type RashguardLogoSlot = (typeof RASHGUARD_LOGO_SLOTS)[number];

export const RASHGUARD_LOGO_SLOT_LABEL: Record<RashguardLogoSlot, string> = {
  'right-front-leg': 'Logo on Right Front Leg',
  'left-front-leg': 'Logo on Left Front Leg',
  'right-back-leg': 'Logo on Right Back Leg',
  'left-back-leg': 'Logo on Left Back Leg',
};

export function logoPriceForSlot(_slot: RashguardLogoSlot) {
  return RASHGUARD_LOGO_PRICE;
}

export const RASHGUARD_ARTWORK_LAYER_PRICE = 10;

export const RASHGUARD_ARTWORK_TARGETS = [
  'rightFrontLeg',
  'leftFrontLeg',
  'rightBackLeg',
  'leftBackLeg',
] as const;
export type RashguardArtworkTarget =
  (typeof RASHGUARD_ARTWORK_TARGETS)[number];

export const RASHGUARD_ARTWORK_TARGET_LABELS: Record<
  RashguardArtworkTarget,
  string
> = {
  rightFrontLeg: 'Right Front Leg',
  leftFrontLeg: 'Left Front Leg',
  rightBackLeg: 'Right Back Leg',
  leftBackLeg: 'Left Back Leg',
};

export interface RashguardLogoAnchor {
  position: [number, number, number];
  rotation: [number, number, number];
  defaultSizeIn: { w: number; h: number };
}

// Scene-space anchors for the on-screen placement gizmo. The model is
// auto-scaled to 2.62 units tall and centred on X/Z at load, so the garment
// spans roughly x ±1.29, z ±0.84, y 0 → 2.62.
export const RASHGUARD_LOGO_ANCHORS: Record<
  RashguardLogoSlot,
  RashguardLogoAnchor
> = {
  'right-front-leg': {
    position: [-0.58, 1.0, 0.9],
    rotation: [0, 0, 0],
    defaultSizeIn: { w: 3, h: 3 },
  },
  'left-front-leg': {
    position: [0.58, 1.0, 0.9],
    rotation: [0, 0, 0],
    defaultSizeIn: { w: 3, h: 3 },
  },
  'right-back-leg': {
    position: [-0.58, 1.0, -0.9],
    rotation: [0, Math.PI, 0],
    defaultSizeIn: { w: 3, h: 3 },
  },
  'left-back-leg': {
    position: [0.58, 1.0, -0.9],
    rotation: [0, Math.PI, 0],
    defaultSizeIn: { w: 3, h: 3 },
  },
};

export const RASHGUARD_SLOT_TARGET_PART: Record<
  RashguardLogoSlot,
  RashguardPart
> = {
  'right-front-leg': 'rightFrontLeg',
  'left-front-leg': 'leftFrontLeg',
  'right-back-leg': 'rightBackLeg',
  'left-back-leg': 'leftBackLeg',
};

// This model ships without dedicated "Target Mesh *" helpers (same as the
// grappling short), so artwork is placed directly on the panel meshes. These
// names intentionally match nothing; artworkTargetForHit falls back to the panel.
export const RASHGUARD_LOGO_TARGET_MESH_NAMES: Record<
  RashguardLogoSlot,
  string
> = {
  'right-front-leg': 'Target Mesh Right Front Leg',
  'left-front-leg': 'Target Mesh Left Front Leg',
  'right-back-leg': 'Target Mesh Right Back Leg',
  'left-back-leg': 'Target Mesh Left Back Leg',
};

export const RASHGUARD_ARTWORK_TARGET_MESH_NAMES: Record<
  RashguardArtworkTarget,
  string
> = {
  rightFrontLeg: 'Target Mesh Right Front Leg',
  leftFrontLeg: 'Target Mesh Left Front Leg',
  rightBackLeg: 'Target Mesh Right Back Leg',
  leftBackLeg: 'Target Mesh Left Back Leg',
};

export type CameraView = 'front' | 'back';

export const CAMERA_POSITIONS: Record<CameraView, [number, number, number]> = {
  front: [0, 1.32, 5.25],
  back: [0, 1.32, -5.25],
};

export const MOBILE_CAMERA_POSITIONS: Record<
  CameraView,
  [number, number, number]
> = {
  front: [0, 1.32, 4.4],
  back: [0, 1.32, -4.4],
};

export const CAMERA_TARGET: [number, number, number] = [0, 1.32, 0];

export function cameraViewToPosition(
  view: CameraView,
  useMobileCamera = false,
): [number, number, number] {
  return (useMobileCamera ? MOBILE_CAMERA_POSITIONS : CAMERA_POSITIONS)[view];
}

// Body panel mesh names → part. The 44 Topstitch_* meshes are routed to
// 'stitching' by the name fallback in rashguard-glb-model (no need to list them).
export const RASHGUARD_MESH_TO_PART: Record<string, RashguardPart> = {
  'Right Front Leg': 'rightFrontLeg',
  'Left Front Leg': 'leftFrontLeg',
  'Right Back Leg': 'rightBackLeg',
  'Left Back Leg': 'leftBackLeg',
  Stitching: 'stitching',
};

export const RASHGUARD_DECORATIVE_MESH_NAMES = new Set<string>([]);
