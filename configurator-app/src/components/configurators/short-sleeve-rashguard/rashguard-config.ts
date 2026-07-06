export const RASHGUARD_MODEL_URL =
  '/models/texture-stitch-rashguard-2.glb?v=20260628-sculpt2';

// The real stitch geometry, exported separately from THIS model and decimated
// (1.24M → ~228k tris) so it's light. Grafted onto the body at the exact same
// coordinates it came from, so the alignment is pixel-perfect.
export const RASHGUARD_STITCH_GRAFT_URL =
  '/models/texture-stitch-rashguard-2-stitch-v2.glb?v=20260628-hires-v2';

export const RASHGUARD_PRODUCT_CONFIG = {
  productName: 'Short Sleeve Rashguard',
  productTitle: 'Custom Short Sleeve Rashguard',
  shopifyProductPath: '/products/custom-rashguard',
  shopifyProductHandle: 'custom-rashguard',
  designNamePrefix: 'Short Sleeve Rashguard Design',
  savedDesignIdPrefix: 'texture_stitch_rashguard_2_saved',
  orderDesignIdPrefix: 'short_sleeve_rashguard_order',
  localStorageKey: 'dspln:short-sleeve-rashguard-designs:v1',
  autoDraftStorageKey: 'dspln:short-sleeve-rashguard-autosave:v1',
  cartStorageKey: 'dspln:short-sleeve-rashguard-test-cart',
  configStoragePrefix: 'dspln:short-sleeve-rashguard-config:',
  netlifyPath: '/configurator/short-sleeve-rashguard',
};

export const RASHGUARD_PARTS = [
  'front',
  'back',
  'leftSleeve',
  'rightSleeve',
  'neckBand',
  'stitching',
] as const;
export type RashguardPart = (typeof RASHGUARD_PARTS)[number];

export const RASHGUARD_PART_LABELS: Record<RashguardPart, string> = {
  front: 'Front Body',
  back: 'Back Body',
  leftSleeve: 'Left Sleeve',
  rightSleeve: 'Right Sleeve',
  neckBand: 'Neck Band',
  stitching: 'Stitching',
};

export const RASHGUARD_DEFAULT_COLORS: Record<RashguardPart, string> = {
  front: '#ffffff',
  back: '#ffffff',
  leftSleeve: '#ffffff',
  rightSleeve: '#ffffff',
  neckBand: '#ffffff',
  stitching: '#ffffff',
};

export const RASHGUARD_COLOR_SWATCHES = [
  { name: 'White', hex: '#ffffff' },
  { name: 'Blue', hex: '#2947bf' },
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

export const RASHGUARD_BASE_PRICE = 65;
export const RASHGUARD_LOGO_PRICE = 10;
export const RASHGUARD_BACK_LOGO_PRICE = 25;

export const RASHGUARD_LOGO_SLOTS = [
  'left-chest',
  'center-chest',
  'back-center',
  'left-sleeve',
  'right-sleeve',
] as const;
export type RashguardLogoSlot = (typeof RASHGUARD_LOGO_SLOTS)[number];

export const RASHGUARD_LOGO_SLOT_LABEL: Record<RashguardLogoSlot, string> = {
  'left-chest': 'Logo on Left Chest',
  'center-chest': 'Logo on Center Chest',
  'back-center': 'Big Logo on Back',
  'left-sleeve': 'Logo on Left Sleeve',
  'right-sleeve': 'Logo on Right Sleeve',
};

export function logoPriceForSlot(slot: RashguardLogoSlot) {
  return slot === 'back-center' ? RASHGUARD_BACK_LOGO_PRICE : RASHGUARD_LOGO_PRICE;
}

export const RASHGUARD_ARTWORK_LAYER_PRICE = 10;

export const RASHGUARD_ARTWORK_TARGETS = [
  'front',
  'back',
  'leftSleeve',
  'rightSleeve',
  'neckBand',
] as const;
export type RashguardArtworkTarget =
  (typeof RASHGUARD_ARTWORK_TARGETS)[number];

export const RASHGUARD_ARTWORK_TARGET_LABELS: Record<
  RashguardArtworkTarget,
  string
> = {
  front: 'Front Body',
  back: 'Back Body',
  leftSleeve: 'Left Sleeve',
  rightSleeve: 'Right Sleeve',
  neckBand: 'Neck Band',
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
  'left-chest': {
    position: [0.32, 1.75, 0.72],
    rotation: [0, 0, 0],
    defaultSizeIn: { w: 3.2, h: 3.2 },
  },
  'center-chest': {
    position: [0, 1.48, 0.76],
    rotation: [0, 0, 0],
    defaultSizeIn: { w: 5.5, h: 5.5 },
  },
  'back-center': {
    position: [0, 1.5, -0.78],
    rotation: [0, Math.PI, 0],
    defaultSizeIn: { w: 7, h: 7 },
  },
  'left-sleeve': {
    position: [1.05, 1.62, -0.02],
    rotation: [0, Math.PI / 2.25, 0],
    defaultSizeIn: { w: 3, h: 3 },
  },
  'right-sleeve': {
    position: [-1.05, 1.62, -0.02],
    rotation: [0, -Math.PI / 2.25, 0],
    defaultSizeIn: { w: 3, h: 3 },
  },
};

export const RASHGUARD_SLOT_TARGET_PART: Record<
  RashguardLogoSlot,
  RashguardPart
> = {
  'left-chest': 'front',
  'center-chest': 'front',
  'back-center': 'back',
  'left-sleeve': 'leftSleeve',
  'right-sleeve': 'rightSleeve',
};

export const RASHGUARD_LOGO_TARGET_MESH_NAMES: Record<
  RashguardLogoSlot,
  string
> = {
  'left-chest': 'Target Mesh Front',
  'center-chest': 'Target Mesh Front',
  'back-center': 'Target Mesh Back',
  'left-sleeve': 'Target Mesh Left Sleeve',
  'right-sleeve': 'Target Mesh Right Sleeve',
};

export const RASHGUARD_ARTWORK_TARGET_MESH_NAMES: Record<
  RashguardArtworkTarget,
  string
> = {
  front: 'Target Mesh Front',
  back: 'Target Mesh Back',
  leftSleeve: 'Target Mesh Left Sleeve',
  rightSleeve: 'Target Mesh Right Sleeve',
  neckBand: 'Target Mesh Neck Band',
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

export const RASHGUARD_MESH_TO_PART: Record<string, RashguardPart> = {
  Front: 'front',
  Front_3: 'front',
  'Front_3.001': 'front',
  Body_F_3268: 'front',
  'Body_F_3268.002': 'front',
  Back: 'back',
  Back_2: 'back',
  'Back.001': 'back',
  Body_B_3277: 'back',
  'Body_B_3277.002': 'back',
  'Left Sleeve': 'leftSleeve',
  'Left Sleeve_2': 'leftSleeve',
  'Left Sleeve_2.001': 'leftSleeve',
  'Right Sleeve': 'rightSleeve',
  'Right Sleeve_2': 'rightSleeve',
  'Right Sleeve_2.001': 'rightSleeve',
  Right_Sleeve_3: 'rightSleeve',
  'Right Sleeve_3': 'rightSleeve',
  'Right Sleeve_3.001': 'rightSleeve',
  'Neck Band': 'neckBand',
  'Neck Band.001': 'neckBand',
  Body_F_3289: 'neckBand',
  'Body_F_3289.002': 'neckBand',
  Stitching: 'stitching',
  Stitch8ing: 'stitching',
  Default_Topstitch_3366: 'stitching',
  'Default Topstitch_3366': 'stitching',
  'Coverlock Hem_3435': 'stitching',
  'Default Topstitch_3389': 'stitching',
  Topstitch_1187875: 'stitching',
  Topstitch_1188593: 'stitching',
  Topstitch_581962: 'stitching',
  Topstitch_829943: 'stitching',
  Topstitch_830659: 'stitching',
  Topstitch_589844: 'stitching',
  Topstitch_590773: 'stitching',
  Topstitch_841336: 'stitching',
  Topstitch_842265: 'stitching',
  Topstitch_597291: 'stitching',
  Topstitch_597281: 'stitching',
  Topstitch_24189201: 'stitching',
  Topstitch_24189111: 'stitching',
  Topstitch_4464301: 'stitching',
  Topstitch_581246: 'stitching',
  'Topstitch_581246.001': 'stitching',
  'Coverlock Hem_3424': 'stitching',
  'Coverlock Hem_3424.002': 'stitching',
  'Default Topstitch_3355': 'stitching',
  'Default Topstitch_3355.002': 'stitching',
  'Default Topstitch_3378': 'stitching',
  'Default Topstitch_3378.002': 'stitching',
};

export const RASHGUARD_DECORATIVE_MESH_NAMES = new Set([
  'DSLPN BACK EMBROIDERY Lighter',
  'DSLPN BACK EMBROIDERY Lighter.001',
  'DSLPN BACK EMBROIDERY Lighter.002',
  'DSLPN BACK EMBROIDERY Lighter.003',
]);
