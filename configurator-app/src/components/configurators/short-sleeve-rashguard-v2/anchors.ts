import {
  RASHGUARD_LOGO_ANCHORS,
  RASHGUARD_LOGO_SLOT_LABEL,
  RASHGUARD_PART_LABELS,
  type RashguardLogoSlot,
  type RashguardPart,
} from '../short-sleeve-rashguard/rashguard-config';

/**
 * Minimal (v2) hotspot anchors — Vectary-style progressive disclosure.
 * Circles = part colours, squares = logo/artwork drop zones.
 *
 * `facing` is the outward normal at the anchor: a hotspot fades out when the
 * camera moves behind the surface it sits on (dot(cameraDir, facing) < 0),
 * which is much cheaper than per-frame occlusion raycasts on a 200k-tri mesh.
 */
export interface V2HotspotAnchor {
  id: string;
  kind: 'color' | 'logo';
  /** part being coloured (color hotspots) */
  part?: RashguardPart;
  /** logo slot (logo hotspots) */
  slot?: RashguardLogoSlot;
  label: string;
  position: [number, number, number];
  facing: [number, number, number];
}

/** Colour circles — placed on each panel, away from the logo squares. */
export const V2_COLOR_ANCHORS: V2HotspotAnchor[] = [
  {
    id: 'color-front',
    kind: 'color',
    part: 'front',
    label: RASHGUARD_PART_LABELS.front,
    position: [-0.34, 1.16, 0.74],
    facing: [0, 0, 1],
  },
  {
    id: 'color-back',
    kind: 'color',
    part: 'back',
    label: RASHGUARD_PART_LABELS.back,
    position: [-0.34, 1.16, -0.76],
    facing: [0, 0, -1],
  },
  // Shoulder-ish so they stay inside a narrow portrait frame on phones
  // (the sleeve tips at |x|≈1.05 crop out of the mobile viewport).
  {
    id: 'color-left-sleeve',
    kind: 'color',
    part: 'leftSleeve',
    label: RASHGUARD_PART_LABELS.leftSleeve,
    position: [0.72, 1.98, 0.42],
    facing: [0.45, 0.3, 0.85],
  },
  {
    id: 'color-right-sleeve',
    kind: 'color',
    part: 'rightSleeve',
    label: RASHGUARD_PART_LABELS.rightSleeve,
    position: [-0.72, 1.98, 0.42],
    facing: [-0.45, 0.3, 0.85],
  },
  {
    id: 'color-neck-band',
    kind: 'color',
    part: 'neckBand',
    label: RASHGUARD_PART_LABELS.neckBand,
    position: [0, 2.12, 0.5],
    facing: [0, 0.35, 1],
  },
  {
    id: 'color-stitching',
    kind: 'color',
    part: 'stitching',
    label: RASHGUARD_PART_LABELS.stitching,
    position: [0.42, 0.5, 0.68],
    facing: [0.2, 0, 1],
  },
];

/** Logo squares — reuse the battle-tested 3D logo-slot anchors from config. */
// Sleeve markers pulled inboard of the true 3D logo anchors for the same
// narrow-frame reason; the upload still lands on the sleeve via the raycast.
const V2_LOGO_MARKER_OVERRIDES: Partial<
  Record<RashguardLogoSlot, { position: [number, number, number]; facing: [number, number, number] }>
> = {
  'left-sleeve': { position: [0.74, 1.62, 0.36], facing: [0.55, 0, 0.85] },
  'right-sleeve': { position: [-0.74, 1.62, 0.36], facing: [-0.55, 0, 0.85] },
};

export const V2_LOGO_ANCHORS: V2HotspotAnchor[] = (
  Object.keys(RASHGUARD_LOGO_ANCHORS) as RashguardLogoSlot[]
).map((slot) => {
  const anchor = RASHGUARD_LOGO_ANCHORS[slot];
  const override = V2_LOGO_MARKER_OVERRIDES[slot];
  const facing: [number, number, number] =
    override?.facing ?? (slot.includes('back') ? [0, 0, -1] : [0, 0, 1]);
  return {
    id: `logo-${slot}`,
    kind: 'logo' as const,
    slot,
    label: RASHGUARD_LOGO_SLOT_LABEL[slot],
    position: override?.position ?? anchor.position,
    facing,
  };
});

export const V2_ALL_ANCHORS: V2HotspotAnchor[] = [
  ...V2_COLOR_ANCHORS,
  ...V2_LOGO_ANCHORS,
];
