// Renders configurator text to a transparent PNG. Shared by the studio
// text tool (preview) and the 3D canvas (decal texture) so both always
// produce identical pixels for the same text/font/color — the spec only
// stores the parameters, never the image.

export const TEXT_FONTS = [
  { label: 'Arial Black', value: '"Arial Black", Arial, sans-serif' },
  { label: 'Impact', value: 'Impact, "Arial Black", sans-serif' },
  { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
  { label: 'Georgia', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Courier', value: '"Courier New", Courier, monospace' },
  { label: 'Brush Script', value: '"Brush Script MT", "Snell Roundhand", cursive' },
] as const;

// Rendered large so print/tech-pack exports stay sharp. Canvas px are
// texture pixels only — physical size comes from the decal dimensions.
const FONT_PX = 220;
const PAD_PX = 30;

export interface RenderedTextImage {
  dataUrl: string;
  width: number;
  height: number;
}

export function renderTextImage(
  text: string,
  fontFamily: string,
  colorHex: string,
): RenderedTextImage | null {
  const clean = text.trim();
  if (!clean || typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const font = `${FONT_PX}px ${fontFamily}`;
  ctx.font = font;
  const metrics = ctx.measureText(clean);
  const ascent = metrics.actualBoundingBoxAscent || FONT_PX * 0.8;
  const descent = metrics.actualBoundingBoxDescent || FONT_PX * 0.25;
  canvas.width = Math.max(1, Math.ceil(metrics.width + PAD_PX * 2));
  canvas.height = Math.max(1, Math.ceil(ascent + descent + PAD_PX * 2));

  // Canvas state resets when its size changes — set the font again.
  ctx.font = font;
  ctx.fillStyle = colorHex;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(clean, PAD_PX, PAD_PX + ascent);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  };
}
