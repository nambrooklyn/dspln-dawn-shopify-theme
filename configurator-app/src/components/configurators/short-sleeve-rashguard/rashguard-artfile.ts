/**
 * Actual-size art-file export for the short-sleeve rashguard.
 *
 * One PDF page per garment piece, each sized to the piece's real cm dimensions,
 * using the exact vector pattern outline as the cut line, the garment colour
 * filled and clipped to that outline, the customer's artwork composited inside
 * (reusing the on-model artwork compositor at print resolution), and a 4" + ruler
 * calibration band on every page. Ported from the proven vanilla-JS exporter.
 *
 * Pure function of serialisable design state + the pattern JSON — no 3D scene
 * access needed (artwork positions are normalised, sizes come from the pattern).
 */
import jsPDF from 'jspdf';

import patternsJson from './rashguard-patterns.json';
import { buildZoneArtworkCanvas } from './rashguard-glb-model';
import {
  RASHGUARD_PART_LABELS,
  type RashguardArtworkTarget,
  type RashguardPart,
} from './rashguard-config';
import type { RashguardArtworkLayer } from './rashguard-state';

type PatternPiece = { widthCm: number; heightCm: number; outline: number[][] };
const PATTERNS = patternsJson as Record<string, PatternPiece>;

// Pieces to export, in order. All printable zones (incl. the neck band) take artwork.
const ART_FILE_PARTS: RashguardPart[] = [
  'front',
  'back',
  'rightSleeve',
  'leftSleeve',
  'neckBand',
];
const ARTWORK_TARGETS = new Set<string>([
  'front',
  'back',
  'leftSleeve',
  'rightSleeve',
  'neckBand',
]);

const MAX_PX = 16000; // stay under the browser's 16384px canvas limit
const CALIB_BAND_MM = 118;

export interface ArtFileOptions {
  dpi?: number;
  marginCm?: number;
  transparentBackground?: boolean;
  showColorFill?: boolean;
  includeBackLogo?: boolean;
  fileName?: string;
  /** 'save' downloads the PDF (default); 'datauri' returns its base64 (for testing). */
  output?: 'save' | 'datauri' | 'archive';
}

/** Order details for the post-order header (date / ship date / order number). */
export interface ArtFileOrderInfo {
  orderDate: string; // e.g. "06/25/2026"
  shipDate: string; // e.g. "07/02/2026" (order date + 7 days)
  orderNumber: string; // e.g. "9151"
}

/** PNG data-URLs of the garment rendered from the 4 tech-pack angles. */
export interface ArtFileViews {
  front: string;
  back: string;
  left: string;
  right: string;
}

export interface ArtFileInput {
  partColors: Record<RashguardPart, string>;
  artworkLayers: RashguardArtworkLayer[];
  options?: ArtFileOptions;
  onProgress?: (index: number, total: number, label: string) => void;
  /** When present, prepend two 8.5×11 render pages with the order header. */
  orderInfo?: ArtFileOrderInfo;
  views?: ArtFileViews;
  /** Aspect (w/h) of the captured view images, for letterbox fitting. */
  viewAspect?: number;
}

// US Letter, portrait, in mm.
const LETTER_W = 215.9;
const LETTER_H = 279.4;
const ORDER_HEADER_H = 16; // mm reserved at the top of every page for the header

/** Draw the DSPLN order header (logo wordmark + date / ship date / order number + rule). */
function drawOrderHeader(
  doc: jsPDF,
  pageWmm: number,
  marginMm: number,
  info: ArtFileOrderInfo,
) {
  const baseY = 9;
  doc.setTextColor(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('D S P L N', marginMm, baseY);

  // Right-aligned fields: small grey label + bold value, laid out right→left.
  const fields: Array<[string, string]> = [
    ['DATE', info.orderDate],
    ['SHIP DATE', info.shipDate],
    ['ORDER NUMBER', info.orderNumber],
  ];
  doc.setFontSize(8);
  let x = pageWmm - marginMm;
  for (let i = fields.length - 1; i >= 0; i--) {
    const [label, value] = fields[i];
    doc.setFont('helvetica', 'bold');
    x -= doc.getTextWidth(value);
    doc.setTextColor(20);
    doc.text(value, x, baseY);
    x -= 1.5;
    doc.setFont('helvetica', 'normal');
    const lw = doc.getTextWidth(label);
    x -= lw;
    doc.setTextColor(140);
    doc.text(label, x, baseY);
    x -= 7; // gap before the next field
  }

  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  doc.line(marginMm, 12.5, pageWmm - marginMm, 12.5);
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
  if (!m) return [255, 255, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Top-right badge: STITCH COLOR label + filled swatch + hex. */
function drawStitchColorBadge(
  doc: jsPDF,
  pageWmm: number,
  marginMm: number,
  subY: number,
  stitchHex: string,
) {
  const [r, g, b] = hexToRgb(stitchHex);
  const sw = 11;
  const swX = pageWmm - marginMm - sw;
  const swY = subY - 6.5;
  doc.setFillColor(r, g, b);
  doc.setDrawColor(180);
  doc.setLineWidth(0.2);
  doc.rect(swX, swY, sw, sw, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(90);
  doc.text('STITCH COLOR', swX - 3, subY - 1, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(stitchHex, swX + sw, swY + sw + 4, { align: 'right' });
}

/** Attention banner drawn on every page: how to view the true RGB colours. */
function drawRgbNotice(doc: jsPDF, pageWmm: number, marginMm: number): number {
  const y = 14;
  const h = 10;
  const x0 = marginMm;
  const w = pageWmm - marginMm * 2;
  doc.setFillColor(255, 244, 214);
  doc.setDrawColor(214, 158, 46);
  doc.setLineWidth(0.5);
  doc.roundedRect(x0, y, w, h, 1.5, 1.5, 'FD');
  const cx = x0 + 5;
  const cy = y + h / 2;
  doc.setFillColor(214, 158, 46);
  doc.circle(cx, cy, 2.7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('!', cx, cy + 1.7, { align: 'center' });
  const tx = x0 + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  doc.setTextColor(150, 95, 10);
  doc.text('OPEN IN RGB — NOT CMYK  (colours look dull in CMYK mode)', tx, y + 4.2);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(120, 85, 20);
  doc.text(
    'Adobe Illustrator: File > Document Color Mode > RGB Color.   This file is sRGB — never convert it to CMYK.',
    tx,
    y + 8,
  );
  return y + h;
}

/** One 8.5×11 render page: header + view label (left) + STITCH COLOR (right) + one big render. */
function drawRenderPage(
  doc: jsPDF,
  image: string,
  caption: string,
  stitchHex: string,
  info: ArtFileOrderInfo,
  aspect: number,
  marginMm: number,
) {
  drawOrderHeader(doc, LETTER_W, marginMm, info);
  const noticeBottom = drawRgbNotice(doc, LETTER_W, marginMm);

  // Sub-header row: view label on the left, stitch-colour badge on the right.
  const subY = noticeBottom + 7;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(90);
  doc.text(caption, marginMm, subY);
  drawStitchColorBadge(doc, LETTER_W, marginMm, subY, stitchHex);

  // Single render, fit + centred in the area below the sub-header.
  const availTop = subY + 8;
  const availBottom = LETTER_H - 12;
  const availW = LETTER_W - marginMm * 2;
  const availH = availBottom - availTop;
  let imgW = availW;
  let imgH = imgW / aspect;
  if (imgH > availH) {
    imgH = availH;
    imgW = imgH * aspect;
  }
  const imgX = marginMm + (availW - imgW) / 2;
  const imgY = availTop + (availH - imgH) / 2;
  doc.addImage(image, 'JPEG', imgX, imgY, imgW, imgH);
}

function patternPath(outline: number[][], outW: number, outH: number, scale = 1): Path2D {
  const cx = outW / 2;
  const cy = outH / 2;
  const path = new Path2D();
  outline.forEach(([nx, ny], i) => {
    const x = cx + (nx * outW - cx) * scale;
    const y = cy + (ny * outH - cy) * scale;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  });
  path.closePath();
  return path;
}

/** Build the print-resolution canvas for one piece (colour + artwork, clipped to outline). */
async function buildPartCanvas(
  part: RashguardPart,
  color: string,
  layers: RashguardArtworkLayer[],
  opts: Required<Omit<ArtFileOptions, 'fileName'>>,
): Promise<{ canvas: HTMLCanvasElement; widthCm: number; heightCm: number } | null> {
  const pattern = PATTERNS[part];
  if (!pattern) return null;

  const cmToPx = (cm: number) => Math.max(1, Math.round((cm / 2.54) * opts.dpi));
  let outW = cmToPx(pattern.widthCm);
  let outH = cmToPx(pattern.heightCm);
  const over = Math.max(outW, outH) / MAX_PX;
  if (over > 1) {
    outW = Math.round(outW / over);
    outH = Math.round(outH / over);
  }

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const o = out.getContext('2d', { alpha: !!opts.transparentBackground });
  if (!o) return null;
  o.imageSmoothingEnabled = true;
  o.imageSmoothingQuality = 'high';
  if (!opts.transparentBackground) {
    o.fillStyle = '#ffffff';
    o.fillRect(0, 0, outW, outH);
  }

  const shape = patternPath(pattern.outline, outW, outH, 1);

  // Garment colour clipped to the cut line (+ grey halo so white pieces show on a white page).
  if (opts.showColorFill || !opts.transparentBackground) {
    if (!opts.transparentBackground) {
      o.fillStyle = '#d8d8d8';
      o.fill(patternPath(pattern.outline, outW, outH, 1.01));
    }
    // Print the EXACT selected swatch colour — the same hex the customer picked in
    // the configurator — with no transform. (`renderHex` only exists to compensate
    // for 3D scene lighting; it must never reach the print file.)
    o.fillStyle = opts.showColorFill ? (color || '#ffffff') : '#ffffff';
    o.fill(shape);
  }

  // Artwork composited at print resolution, clipped to the cut line.
  if (ARTWORK_TARGETS.has(part)) {
    const art = await buildZoneArtworkCanvas(part as RashguardArtworkTarget, layers, {
      width: outW,
      height: outH,
      includeBackLogo: opts.includeBackLogo,
    });
    o.save();
    o.clip(shape);
    o.drawImage(art, 0, 0, outW, outH);
    o.restore();
    art.width = art.height = 0;
  }

  // Crisp cut line on top.
  o.save();
  o.strokeStyle = '#9aa0a6';
  o.lineWidth = Math.max(1, outW * 0.0008);
  o.lineJoin = 'round';
  o.stroke(shape);
  o.restore();

  return { canvas: out, widthCm: pattern.widthCm, heightCm: pattern.heightCm };
}

function drawCalibrationBand(doc: jsPDF, pageW: number, pageH: number, marginMm: number) {
  const IN = 25.4;
  const yTop = pageH - CALIB_BAND_MM;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, yTop, pageW, CALIB_BAND_MM, 'F');
  doc.setDrawColor(150);
  doc.setLineWidth(0.3);
  doc.line(marginMm, yTop, pageW - marginMm, yTop);

  doc.setFontSize(9);
  doc.setTextColor(60);
  doc.text(
    'SCALE CHECK — at 100% print, the square is 4 in (10.16 cm). Verify with the ruler; if it is off, your printer is not at "Actual size".',
    marginMm,
    yTop + 6,
  );

  const sq = 4 * IN;
  const sqX = marginMm;
  const sqY = yTop + 11;
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(sqX, sqY, sq, sq);
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text('4 in', sqX + sq / 2, sqY + sq / 2 - 1, { align: 'center' });
  doc.setFontSize(8);
  doc.text('10.16 cm', sqX + sq / 2, sqY + sq / 2 + 5, { align: 'center' });

  const rulerX = sqX + sq + 18;
  const avail = pageW - marginMm - rulerX;
  if (avail > 40) {
    const rulerLen = Math.min(avail, 220);
    const baseY = sqY + sq / 2;
    doc.setDrawColor(0);
    doc.setLineWidth(0.4);
    doc.line(rulerX, baseY, rulerX + rulerLen, baseY);
    doc.setFontSize(6);
    doc.setTextColor(0);
    const cmCount = Math.floor(rulerLen / 10);
    for (let i = 0; i <= cmCount; i++) {
      const tx = rulerX + i * 10;
      const h = i % 5 === 0 ? 5 : 2.5;
      doc.line(tx, baseY, tx, baseY - h);
      if (i % 5 === 0) doc.text(String(i), tx, baseY - h - 1.5, { align: 'center' });
    }
    doc.text('cm', rulerX - 7, baseY - 4);
    const inCount = Math.floor(rulerLen / IN);
    for (let i = 0; i <= inCount; i++) {
      const tx = rulerX + i * IN;
      doc.line(tx, baseY, tx, baseY + 5);
      doc.text(String(i), tx, baseY + 9, { align: 'center' });
    }
    doc.text('in', rulerX - 6, baseY + 6);
  }
}

/** Generate and download the multi-page actual-size art-file PDF. */
export async function generateRashguardArtFile(
  input: ArtFileInput,
): Promise<string | Blob | void> {
  const opts: Required<Omit<ArtFileOptions, 'fileName'>> & { fileName: string } = {
    // 300 DPI is the practical default for these large pieces (≈40 MP each) —
    // sublimation-grade and far lighter than 600 DPI (≈160 MP). Override per call.
    dpi: input.options?.dpi ?? 300,
    marginCm: input.options?.marginCm ?? 1.5,
    transparentBackground: input.options?.transparentBackground ?? true,
    showColorFill: input.options?.showColorFill ?? true,
    includeBackLogo: input.options?.includeBackLogo ?? true,
    output: input.options?.output ?? 'save',
    fileName: input.options?.fileName ?? 'short-sleeve-rashguard-art-file.pdf',
  };

  const parts = ART_FILE_PARTS.filter((p) => PATTERNS[p]);
  if (!parts.length) return;

  const mm = (cm: number) => cm * 10;
  const margin = opts.marginCm;
  const headerH = 26;
  const { orderInfo, views } = input;
  const viewAspect = input.viewAspect ?? 1100 / 1500;
  // Order header sits at the top of every page once an order is placed.
  const orderTop = orderInfo ? ORDER_HEADER_H : 0;
  let doc: jsPDF | null = null;

  // Pages 1–2: the 8.5×11 render pages (front/back, then the two side views).
  if (orderInfo && views) {
    doc = new jsPDF({
      unit: 'mm',
      format: [LETTER_W, LETTER_H],
      orientation: 'portrait',
    });
    const stitchHex = input.partColors.stitching;
    const renderPages: Array<[string, string]> = [
      [views.front, 'FRONT'],
      [views.back, 'BACK'],
      // The capture's left/right cameras show the opposite garment side, so
      // swap them here: `views.right` is the actual LEFT side, and vice-versa.
      [views.right, 'LEFT SIDE'],
      [views.left, 'RIGHT SIDE'],
    ];
    renderPages.forEach(([image, caption], i) => {
      if (i > 0) doc!.addPage([LETTER_W, LETTER_H], 'portrait');
      drawRenderPage(doc!, image, caption, stitchHex, orderInfo, viewAspect, mm(margin));
    });
  }

  // Remaining pages: the actual-size pattern pieces.
  for (let idx = 0; idx < parts.length; idx++) {
    const part = parts[idx];
    input.onProgress?.(idx, parts.length, RASHGUARD_PART_LABELS[part]);
    await new Promise((r) => setTimeout(r, 0)); // yield so progress can paint

    const built = await buildPartCanvas(
      part,
      input.partColors[part],
      input.artworkLayers,
      opts,
    );
    if (!built) continue;
    const { canvas, widthCm, heightCm } = built;

    const pageW = mm(widthCm + margin * 2);
    const pageH = mm(heightCm + margin * 2) + headerH + CALIB_BAND_MM + orderTop;
    const orientation = pageW > pageH ? 'landscape' : 'portrait';

    if (!doc) doc = new jsPDF({ unit: 'mm', format: [pageW, pageH], orientation });
    else doc.addPage([pageW, pageH], orientation);

    if (orderInfo) drawOrderHeader(doc, pageW, mm(margin), orderInfo);
    const noticeBottom = drawRgbNotice(doc, pageW, mm(margin));

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(20);
    doc.text(
      `${RASHGUARD_PART_LABELS[part]}  —  ${Math.round(widthCm)} × ${Math.round(heightCm)} cm (actual size)  —  COLOR ${input.partColors[part].toUpperCase()}`,
      mm(margin),
      noticeBottom + 6,
    );
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `Print at 100% / "Actual size" — do not "fit to page". Part ${idx + 1} of ${parts.length}.  Colours are sRGB — print in RGB, do not convert to CMYK.`,
      mm(margin),
      noticeBottom + 11,
    );

    const imgData = canvas.toDataURL('image/png');
    doc.addImage(imgData, 'PNG', mm(margin), orderTop + headerH, mm(widthCm), mm(heightCm), undefined, 'FAST');
    doc.setDrawColor(190);
    doc.setLineWidth(0.2);
    doc.rect(mm(margin), orderTop + headerH, mm(widthCm), mm(heightCm));

    drawCalibrationBand(doc, pageW, pageH, mm(margin));
    canvas.width = canvas.height = 0;
  }

  if (!doc) return;
  if (input.options?.output === 'datauri') {
    return (doc.output('datauristring') as string).split(',')[1];
  }
  if (input.options?.output !== 'archive') doc.save(opts.fileName);
  // Hand back the exact bytes so callers can freeze them in the versioned
  // tech-pack store ('archive' mode skips the browser download entirely).
  return doc.output('blob') as Blob;
}
