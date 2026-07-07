export const BASE_SIZES = [
  'A00',
  'A0',
  'A1',
  'A2',
  'A3',
  'A4',
  'A5',
  'A6',
] as const;

export const SIZE_VARIANTS = ['S', '', 'L'] as const;

export const STANDARD_SIZES = BASE_SIZES.flatMap((base) =>
  SIZE_VARIANTS.map((variant) => `${base}${variant}`),
);

export const CUSTOM_MEASUREMENTS = 'Custom Measurements';

export const SIZE_OPTIONS = [...STANDARD_SIZES, CUSTOM_MEASUREMENTS];

export const BELT_BASE_SIZES = [
  'A00',
  'A0',
  'A1',
  'A2',
  'A3',
  'A4',
  'A5',
  'A6',
] as const;
