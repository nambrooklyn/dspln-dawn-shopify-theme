import {
  KIMONO_LOGO_ANCHORS,
  KIMONO_LOGO_SLOT_CAMERA_VIEW,
  KIMONO_LOGO_SLOT_LABEL,
  KIMONO_SUBPART_CAMERA_VIEW,
  KIMONO_SUBPART_LABEL,
  PANT_LOGO_ANCHORS,
  PANT_LOGO_SLOT_CAMERA_VIEW,
  PANT_LOGO_SLOT_LABEL,
  PANT_SUBPART_CAMERA_VIEW,
  PANT_SUBPART_LABEL,
  STUDIO_ONLY_KIMONO_LOGO_SLOTS,
  type CameraView,
  type GiPart,
  type KimonoLogoSlot,
  type KimonoSubPart,
  type PantLogoSlot,
  type PantSubPart,
} from '../kids-gi/gi-config';

/**
 * V2 minimal-shell hotspot anchors for the gi.
 *
 * Circles = colour zones, dashed squares = logo slots, small circles on the
 * belt ends = embroidery. Every anchor carries the SAME close-up camera view
 * the v1 sidebar sections used, so a tap glides the camera to the detail it
 * controls (Vectary-style).
 *
 * World space: the gi model auto-scales to ~2.5 units tall, waist ≈ y 1.25,
 * chest ≈ y 2, front surface z ≈ 0.42–0.47. `facing` is the outward surface
 * normal used to fade the hotspot when the camera orbits behind it.
 */
export type GiV2Anchor = {
  id: string;
  /** which garment the hotspot belongs to — hidden when the part is removed */
  part: GiPart;
  label: string;
  position: [number, number, number];
  facing: [number, number, number];
  view: CameraView;
  /** Logo slots only: the true print footprint on the fabric — the v1 decal
   *  anchor's position/rotation and default size (1 in ≈ 0.1 world unit).
   *  Lets a shell draw the marker as a plane lying ON the gi instead of a
   *  camera-facing billboard. */
  plane?: {
    position: [number, number, number];
    rotation: [number, number, number];
    sizeIn: { w: number; h: number };
  };
} & (
  | { kind: 'kimono-color'; sub: KimonoSubPart }
  | { kind: 'pant-color'; sub: PantSubPart }
  | { kind: 'belt-color' }
  | { kind: 'kimono-logo'; slot: KimonoLogoSlot }
  | { kind: 'pant-logo'; slot: PantLogoSlot }
  | { kind: 'belt-end'; end: 'left' | 'right' }
);

const KIMONO_COLOR_POSITIONS: Record<
  KimonoSubPart,
  { position: [number, number, number]; facing: [number, number, number] }
> = {
  body: { position: [0.32, 1.7, 0.44], facing: [0, 0, 1] },
  lapel: { position: [-0.1, 2.12, 0.47], facing: [0, 0, 1] },
  reinforcement: { position: [0.5, 0.95, 0.38], facing: [0.35, 0, 0.94] },
  stitching: { position: [-0.45, 1.7, 0.38], facing: [-0.3, 0, 0.95] },
};

const PANT_COLOR_POSITIONS: Record<
  PantSubPart,
  { position: [number, number, number]; facing: [number, number, number] }
> = {
  body: { position: [-0.24, 0.85, 0.3], facing: [0, 0, 1] },
  reinforcement: { position: [0.26, 0.45, 0.3], facing: [0, 0, 1] },
  stitching: { position: [-0.28, 0.55, 0.3], facing: [0, 0, 1] },
  drawcord: { position: [0.06, 1.36, 0.45], facing: [0, 0, 1] },
};

const kimonoColorAnchors: GiV2Anchor[] = (
  Object.keys(KIMONO_COLOR_POSITIONS) as KimonoSubPart[]
).map((sub) => ({
  id: `kimono-color-${sub}`,
  kind: 'kimono-color',
  part: 'jacket',
  sub,
  label: KIMONO_SUBPART_LABEL[sub],
  view: KIMONO_SUBPART_CAMERA_VIEW[sub],
  ...KIMONO_COLOR_POSITIONS[sub],
}));

const pantColorAnchors: GiV2Anchor[] = (
  Object.keys(PANT_COLOR_POSITIONS) as PantSubPart[]
).map((sub) => ({
  id: `pant-color-${sub}`,
  kind: 'pant-color',
  part: 'pants',
  sub,
  label: PANT_SUBPART_LABEL[sub],
  view: PANT_SUBPART_CAMERA_VIEW[sub],
  ...PANT_COLOR_POSITIONS[sub],
}));

const beltAnchors: GiV2Anchor[] = [
  // Positions MEASURED off the loaded Belt mesh (vertex sampling in the live
  // scene — the belt band actually sits at y≈1.45-1.65, straps end at
  // y≈1.07): color dot on the band left of the knot, embroidery dots
  // mid-way down each dangling end strap. Wearer's LEFT end hangs on the
  // camera's RIGHT (+x), matching the v1 'left-belt-end' camera view.
  {
    id: 'belt-color',
    kind: 'belt-color',
    part: 'belt',
    label: 'Belt Color',
    position: [-0.18, 1.5, 0.26],
    facing: [0, 0.15, 1],
    view: 'belt-close',
  },
  {
    id: 'belt-end-left',
    kind: 'belt-end',
    part: 'belt',
    end: 'left',
    label: 'Left Belt End Embroidery',
    position: [0.2, 1.2, 0.34],
    facing: [0.15, 0, 1],
    view: 'left-belt-end',
  },
  {
    id: 'belt-end-right',
    kind: 'belt-end',
    part: 'belt',
    end: 'right',
    label: 'Right Belt End Embroidery',
    position: [-0.16, 1.24, 0.31],
    facing: [-0.15, 0, 1],
    view: 'right-belt-end',
  },
];

// Logo squares reuse the exact v1 3D anchors — an upload lands right there.
function facingForKimonoSlot(slot: KimonoLogoSlot): [number, number, number] {
  if (slot === 'left-sleeve') return [0.95, 0, 0.12];
  if (slot === 'right-sleeve') return [-0.95, 0, 0.12];
  if (slot === 'back' || slot === 'back-skirt') return [0, 0, -1];
  return [0, 0, 1];
}

const kimonoLogoAnchors: GiV2Anchor[] = (
  Object.keys(KIMONO_LOGO_ANCHORS) as KimonoLogoSlot[]
)
  .filter((slot) => !STUDIO_ONLY_KIMONO_LOGO_SLOTS.includes(slot))
  .map((slot) => ({
    id: `kimono-logo-${slot}`,
    kind: 'kimono-logo',
    part: 'jacket',
    slot,
    label: KIMONO_LOGO_SLOT_LABEL[slot],
    position: KIMONO_LOGO_ANCHORS[slot].position,
    facing: facingForKimonoSlot(slot),
    view: KIMONO_LOGO_SLOT_CAMERA_VIEW[slot],
    plane: {
      position: KIMONO_LOGO_ANCHORS[slot].position,
      rotation: KIMONO_LOGO_ANCHORS[slot].rotation,
      sizeIn: KIMONO_LOGO_ANCHORS[slot].defaultSizeIn,
    },
  }));

const pantLogoAnchors: GiV2Anchor[] = (
  Object.keys(PANT_LOGO_ANCHORS) as PantLogoSlot[]
).map((slot) => ({
  id: `pant-logo-${slot}`,
  kind: 'pant-logo',
  part: 'pants',
  slot,
  label: PANT_LOGO_SLOT_LABEL[slot],
  position: [
    PANT_LOGO_ANCHORS[slot].position[0],
    PANT_LOGO_ANCHORS[slot].position[1],
    PANT_LOGO_ANCHORS[slot].position[2] + 0.06,
  ],
  facing: [0, 0, 1],
  view: PANT_LOGO_SLOT_CAMERA_VIEW[slot],
  plane: {
    position: PANT_LOGO_ANCHORS[slot].position,
    rotation: PANT_LOGO_ANCHORS[slot].rotation,
    sizeIn: PANT_LOGO_ANCHORS[slot].defaultSizeIn,
  },
}));

export const GI_V2_ANCHORS: GiV2Anchor[] = [
  ...kimonoColorAnchors,
  ...pantColorAnchors,
  ...beltAnchors,
  ...kimonoLogoAnchors,
  ...pantLogoAnchors,
];
