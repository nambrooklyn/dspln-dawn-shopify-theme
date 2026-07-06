// Adult sizing measurements, transcribed from "DSPLN Adult Sizing Specs.pdf".
// Keyed by the size codes produced in
// src/components/configurators/shared/part-sections/size-options.ts (A00S..A6L).
// Units are as printed on the spec sheet (cm). Page 4 of the tech pack reads
// these for the ordered kimono size and pant size.

export interface SizeSpec {
  // Kimono measurements
  wingSpan: number;
  centerBack: number;
  chestWidth: number;
  sleeveOpening: number;
  sideSlit: number;
  // Pant measurements
  waist: number;
  outseam: number; // from back waist
  frontRise: number;
  legOpening: number;
}

export const SIZE_SPECS: Record<string, SizeSpec> = {
  // size:     wing  cback chest sleeve slit  waist outseam frise legop
  A00S: { wingSpan: 142, centerBack: 64, chestWidth: 50, sleeveOpening: 15.25, sideSlit: 13, waist: 46, outseam: 91, frontRise: 31, legOpening: 22 },
  A00:  { wingSpan: 150, centerBack: 68, chestWidth: 50, sleeveOpening: 15.25, sideSlit: 14, waist: 46, outseam: 94, frontRise: 32, legOpening: 22 },
  A00L: { wingSpan: 158, centerBack: 72, chestWidth: 50, sleeveOpening: 15.25, sideSlit: 15, waist: 46, outseam: 97.5, frontRise: 33, legOpening: 22 },

  A0S:  { wingSpan: 150, centerBack: 68, chestWidth: 54, sleeveOpening: 15.75, sideSlit: 14, waist: 50, outseam: 94, frontRise: 32, legOpening: 22 },
  A0:   { wingSpan: 158, centerBack: 72, chestWidth: 54, sleeveOpening: 15.75, sideSlit: 15, waist: 50, outseam: 97.5, frontRise: 33, legOpening: 22 },
  A0L:  { wingSpan: 164, centerBack: 75, chestWidth: 54, sleeveOpening: 15.75, sideSlit: 16, waist: 50, outseam: 100.5, frontRise: 34, legOpening: 22 },

  A1S:  { wingSpan: 158, centerBack: 72, chestWidth: 59, sleeveOpening: 16.25, sideSlit: 15, waist: 52, outseam: 97.5, frontRise: 33, legOpening: 22 },
  A1:   { wingSpan: 164, centerBack: 75, chestWidth: 59, sleeveOpening: 16.25, sideSlit: 16, waist: 52, outseam: 100.5, frontRise: 34, legOpening: 22 },
  A1L:  { wingSpan: 175, centerBack: 79, chestWidth: 59, sleeveOpening: 16.25, sideSlit: 17, waist: 52, outseam: 104.5, frontRise: 35, legOpening: 22 },

  A2S:  { wingSpan: 164, centerBack: 75, chestWidth: 63, sleeveOpening: 16.5, sideSlit: 16, waist: 57, outseam: 100.5, frontRise: 34, legOpening: 23 },
  A2:   { wingSpan: 175, centerBack: 79, chestWidth: 63, sleeveOpening: 16.5, sideSlit: 17, waist: 57, outseam: 104.5, frontRise: 35, legOpening: 23 },
  A2L:  { wingSpan: 180, centerBack: 84, chestWidth: 63, sleeveOpening: 16.5, sideSlit: 18, waist: 57, outseam: 109.5, frontRise: 36, legOpening: 23 },

  A3S:  { wingSpan: 175, centerBack: 79, chestWidth: 67, sleeveOpening: 17, sideSlit: 17, waist: 60, outseam: 104.5, frontRise: 35, legOpening: 24 },
  A3:   { wingSpan: 180, centerBack: 84, chestWidth: 67, sleeveOpening: 17, sideSlit: 18, waist: 60, outseam: 109.5, frontRise: 36, legOpening: 24 },
  A3L:  { wingSpan: 188, centerBack: 87, chestWidth: 67, sleeveOpening: 17, sideSlit: 19, waist: 60, outseam: 112.5, frontRise: 37, legOpening: 25 },

  A4S:  { wingSpan: 180, centerBack: 84, chestWidth: 71, sleeveOpening: 17.5, sideSlit: 18, waist: 66, outseam: 109.5, frontRise: 36, legOpening: 25 },
  A4:   { wingSpan: 188, centerBack: 87, chestWidth: 71, sleeveOpening: 17.5, sideSlit: 19, waist: 66, outseam: 112.5, frontRise: 37, legOpening: 25 },
  A4L:  { wingSpan: 190, centerBack: 90, chestWidth: 71, sleeveOpening: 17.5, sideSlit: 20, waist: 66, outseam: 115.5, frontRise: 38, legOpening: 25 },

  A5S:  { wingSpan: 188, centerBack: 87, chestWidth: 74, sleeveOpening: 18, sideSlit: 19, waist: 69, outseam: 112.5, frontRise: 37, legOpening: 26 },
  A5:   { wingSpan: 190, centerBack: 90, chestWidth: 74, sleeveOpening: 18, sideSlit: 20, waist: 69, outseam: 115.5, frontRise: 38, legOpening: 26 },
  A5L:  { wingSpan: 198, centerBack: 93, chestWidth: 74, sleeveOpening: 18, sideSlit: 21, waist: 69, outseam: 119, frontRise: 39, legOpening: 26 },

  A6S:  { wingSpan: 190, centerBack: 90, chestWidth: 80, sleeveOpening: 19, sideSlit: 20, waist: 69, outseam: 112.5, frontRise: 37, legOpening: 26 },
  A6:   { wingSpan: 198, centerBack: 93, chestWidth: 80, sleeveOpening: 19, sideSlit: 20, waist: 69, outseam: 115.5, frontRise: 38, legOpening: 26 },
  A6L:  { wingSpan: 216, centerBack: 96, chestWidth: 80, sleeveOpening: 19, sideSlit: 20, waist: 69, outseam: 119, frontRise: 39, legOpening: 26 },
};

export function lookupSizeSpec(size: string): SizeSpec | null {
  return SIZE_SPECS[size] ?? null;
}
