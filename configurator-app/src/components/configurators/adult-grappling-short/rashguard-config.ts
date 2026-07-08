export const RASHGUARD_MODEL_URL =
  '/models/adult-grappling-short.glb?v=20260630';

// NOTE: unlike the rashguards, this model's stitches are already MESH baked into
// the single GLB (the Topstitch_* meshes), so there is no separate stitch graft.

export const RASHGUARD_PRODUCT_CONFIG = {
  productName: 'Adult Grappling Short',
  productTitle: 'Custom Adult Grappling Short',
  shopifyProductPath: '/products/custom-grappling-short-black',
  shopifyProductHandle: 'custom-grappling-short-black',
  designNamePrefix: 'Adult Grappling Short Design',
  savedDesignIdPrefix: 'adult_grappling_short_saved',
  orderDesignIdPrefix: 'adult_grappling_short_order',
  localStorageKey: 'dspln:adult-grappling-short-designs:v1',
  autoDraftStorageKey: 'dspln:adult-grappling-short-autosave:v1',
  cartStorageKey: 'dspln:adult-grappling-short-test-cart',
  configStoragePrefix: 'dspln:adult-grappling-short-config:',
  netlifyPath: '/configurator/adult-grappling-short',
};

export const RASHGUARD_PARTS = [
  'waistband',
  'rightFrontLeg',
  'rightBackLeg',
  'leftFrontLeg',
  'leftBackLeg',
  'stitching',
] as const;
export type RashguardPart = (typeof RASHGUARD_PARTS)[number];

export const RASHGUARD_PART_LABELS: Record<RashguardPart, string> = {
  waistband: 'Waistband',
  rightFrontLeg: 'Right Front Leg',
  rightBackLeg: 'Right Back Leg',
  leftFrontLeg: 'Left Front Leg',
  leftBackLeg: 'Left Back Leg',
  stitching: 'Stitching',
};

export const RASHGUARD_DEFAULT_COLORS: Record<RashguardPart, string> = {
  waistband: '#ffffff',
  rightFrontLeg: '#ffffff',
  rightBackLeg: '#ffffff',
  leftFrontLeg: '#ffffff',
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

export const RASHGUARD_SIZE_OPTIONS = [
  'XXS',
  'XS',
  'S',
  'M',
  'L',
  'XL',
  'XXL',
  'XXXL',
] as const;

export const RASHGUARD_BASE_PRICE = 55;
export const RASHGUARD_LOGO_PRICE = 10;
export const RASHGUARD_BACK_LOGO_PRICE = 25;

export const RASHGUARD_LOGO_SLOTS = [
  'right-front-leg',
  'left-front-leg',
  'right-back-leg',
  'left-back-leg',
  'waistband',
] as const;
export type RashguardLogoSlot = (typeof RASHGUARD_LOGO_SLOTS)[number];

export const RASHGUARD_LOGO_SLOT_LABEL: Record<RashguardLogoSlot, string> = {
  'right-front-leg': 'Logo on Right Front Leg',
  'left-front-leg': 'Logo on Left Front Leg',
  'right-back-leg': 'Logo on Right Back Leg',
  'left-back-leg': 'Logo on Left Back Leg',
  waistband: 'Logo on Waistband',
};

export function logoPriceForSlot(_slot: RashguardLogoSlot) {
  return RASHGUARD_LOGO_PRICE;
}

export const RASHGUARD_ARTWORK_LAYER_PRICE = 10;

export const RASHGUARD_ARTWORK_TARGETS = [
  'waistband',
  'rightFrontLeg',
  'rightBackLeg',
  'leftFrontLeg',
  'leftBackLeg',
] as const;
export type RashguardArtworkTarget =
  (typeof RASHGUARD_ARTWORK_TARGETS)[number];

export const RASHGUARD_ARTWORK_TARGET_LABELS: Record<
  RashguardArtworkTarget,
  string
> = {
  waistband: 'Waistband',
  rightFrontLeg: 'Right Front Leg',
  rightBackLeg: 'Right Back Leg',
  leftFrontLeg: 'Left Front Leg',
  leftBackLeg: 'Left Back Leg',
};

export interface RashguardLogoAnchor {
  position: [number, number, number];
  rotation: [number, number, number];
  defaultSizeIn: { w: number; h: number };
}

export const RASHGUARD_LOGO_ANCHORS: Record<
  RashguardLogoSlot,
  RashguardLogoAnchor
> = {
  'right-front-leg': {
    position: [-0.55, 1.0, 0.55],
    rotation: [0, 0, 0],
    defaultSizeIn: { w: 3, h: 3 },
  },
  'left-front-leg': {
    position: [0.55, 1.0, 0.55],
    rotation: [0, 0, 0],
    defaultSizeIn: { w: 3, h: 3 },
  },
  'right-back-leg': {
    position: [-0.55, 1.0, -0.55],
    rotation: [0, Math.PI, 0],
    defaultSizeIn: { w: 3, h: 3 },
  },
  'left-back-leg': {
    position: [0.55, 1.0, -0.55],
    rotation: [0, Math.PI, 0],
    defaultSizeIn: { w: 3, h: 3 },
  },
  waistband: {
    position: [0, 1.55, 0.6],
    rotation: [0, 0, 0],
    defaultSizeIn: { w: 3.5, h: 1.4 },
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
  waistband: 'waistband',
};

export const RASHGUARD_LOGO_TARGET_MESH_NAMES: Record<
  RashguardLogoSlot,
  string
> = {
  'right-front-leg': 'Target Mesh Right Front Leg',
  'left-front-leg': 'Target Mesh Left Front Leg',
  'right-back-leg': 'Target Mesh Right Back Leg',
  'left-back-leg': 'Target Mesh Left Back Leg',
  waistband: 'Target Mesh Waistband',
};

export const RASHGUARD_ARTWORK_TARGET_MESH_NAMES: Record<
  RashguardArtworkTarget,
  string
> = {
  waistband: 'Target Mesh Waistband',
  rightFrontLeg: 'Target Mesh Right Front Leg',
  rightBackLeg: 'Target Mesh Right Back Leg',
  leftFrontLeg: 'Target Mesh Left Front Leg',
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

// Body panel mesh names → part. The Topstitch_* mesh stitches are routed to
// 'stitching' by the name fallback in rashguard-glb-model (no need to list them).
export const RASHGUARD_MESH_TO_PART: Record<string, RashguardPart> = {
  Waistband: 'waistband',
  'Right Front Leg': 'rightFrontLeg',
  'Right Back Leg': 'rightBackLeg',
  'Left Front Leg': 'leftFrontLeg',
  'Left Back Leg': 'leftBackLeg',
  Stitching: 'stitching',
};

export const RASHGUARD_DECORATIVE_MESH_NAMES = new Set<string>([]);
