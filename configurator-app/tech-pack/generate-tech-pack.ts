import jsPDF from 'jspdf';

import type {
  TechPackColor,
  TechPackData,
  TechPackLogoSlot,
} from './tech-pack-data';
import { lookupSizeSpec } from './size-specs';

// A4 portrait in points. Mirrors export-pdf.ts conventions.
const MARGIN = 36;
const RED: [number, number, number] = [224, 32, 32];
const BORDER = 200;
const INK = 20;
const MUTED = 110;

/** jsPDF needs the image format; sniff it from the data URL prefix. */
function imgFormat(dataUrl: string): 'PNG' | 'JPEG' {
  return dataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
}

function safeAddImage(
  pdf: jsPDF,
  dataUrl: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  try {
    pdf.addImage(dataUrl, imgFormat(dataUrl), x, y, w, h);
  } catch {
    // A bad image must never abort PDF generation (same posture as export-pdf.ts).
    pdf.setDrawColor(BORDER);
    pdf.rect(x, y, w, h);
  }
}

/** DSPLN wordmark + ORDER# band, drawn at the top of every page. */
function drawHeader(pdf: jsPDF, orderNumber: string): number {
  const pageW = pdf.internal.pageSize.getWidth();
  const boxX = MARGIN;
  const boxY = MARGIN - 8;
  const boxW = 150;
  const boxH = 30;

  pdf.setDrawColor(INK);
  pdf.setLineWidth(1.5);
  pdf.rect(boxX, boxY, boxW, boxH);
  pdf.setLineWidth(1);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.setTextColor(INK);
  pdf.text('DSPLN', boxX + 14, boxY + 21, { charSpace: 5 });

  pdf.setFontSize(16);
  pdf.text(`ORDER# ${orderNumber}`, pageW - MARGIN, boxY + 21, {
    align: 'right',
  });

  return boxY + boxH + 24; // y where page content can start
}

/** Two square renders side by side (front/back or left/right). */
function drawRenderPair(
  pdf: jsPDF,
  startY: number,
  left: { url: string; label: string },
  right: { url: string; label: string },
) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;
  const gap = 16;
  const imgW = (contentW - gap) / 2;
  const imgH = Math.min(imgW * 1.3, pageH - startY - 60);

  safeAddImage(pdf, left.url, MARGIN, startY, imgW, imgH);
  safeAddImage(pdf, right.url, MARGIN + imgW + gap, startY, imgW, imgH);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(MUTED);
  pdf.text(left.label, MARGIN, startY + imgH + 16);
  pdf.text(right.label, MARGIN + imgW + gap, startY + imgH + 16);
  pdf.setTextColor(INK);
}

interface SpecRow {
  label: string;
  color?: TechPackColor;
  logo?: TechPackLogoSlot;
  value?: string;
}

/** A bordered QC section: title row with size, then labelled rows + checkboxes. */
function drawSpecSection(
  pdf: jsPDF,
  startY: number,
  title: string,
  sizeValue: string,
  rows: SpecRow[],
): number {
  const pageW = pdf.internal.pageSize.getWidth();
  const x = MARGIN;
  const w = pageW - MARGIN * 2;
  const qcW = 30; // checkbox column on the far right
  const rowH = 26;
  const titleH = 30;

  pdf.setDrawColor(INK);
  pdf.setLineWidth(1);

  // Title row
  pdf.rect(x, startY, w - qcW, titleH);
  pdf.rect(x + w - qcW, startY, qcW, titleH); // QC checkbox cell
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.text(title, x + 10, startY + 20);
  pdf.text(sizeValue, x + w * 0.4, startY + 20);

  let y = startY + titleH;
  pdf.setFontSize(10);

  rows.forEach((row) => {
    pdf.rect(x, y, w - qcW, rowH);
    pdf.rect(x + w - qcW, y, qcW, rowH);

    // Label (right-aligned toward the middle, like the sample)
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(MUTED);
    pdf.text(row.label, x + w * 0.36, y + rowH / 2 + 3, { align: 'right' });
    pdf.setTextColor(INK);

    const markX = x + w * 0.42;
    const markY = y + rowH / 2;

    if (row.color) {
      pdf.setFillColor(row.color.hex);
      pdf.setDrawColor(BORDER);
      pdf.rect(markX, markY - 7, 16, 14, 'FD');
      pdf.setDrawColor(INK);
      pdf.setFont('helvetica', 'bold');
      pdf.text(row.color.name.toUpperCase(), markX + 24, markY + 3);
    } else if (row.logo) {
      safeAddImage(pdf, row.logo.dataUrl, markX, markY - 9, 18, 18);
      pdf.setFont('helvetica', 'bold');
      pdf.text('YES', markX + 26, markY + 3);
    } else if (row.logo === null && row.value === undefined) {
      pdf.setFont('helvetica', 'bold');
      pdf.text('NO', markX, markY + 3);
    } else {
      pdf.setFont('helvetica', 'bold');
      pdf.text(row.value ?? '', markX, markY + 3);
    }

    y += rowH;
  });

  return y;
}

/** Page 4 measurement block: red size header + measurement rows. */
function drawMeasurementBlock(
  pdf: jsPDF,
  startY: number,
  title: string,
  sizeCode: string,
  rows: Array<{ name: string; value: string }>,
): number {
  const pageW = pdf.internal.pageSize.getWidth();
  const x = MARGIN;
  const w = pageW - MARGIN * 2;
  const valW = 110; // right value column
  const rowH = 26;

  pdf.setDrawColor(INK);
  pdf.setLineWidth(1);

  // Header row: title (left) + size code in a red cell (right)
  pdf.rect(x, startY, w - valW, rowH);
  pdf.setFillColor(RED[0], RED[1], RED[2]);
  pdf.rect(x + w - valW, startY, valW, rowH, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.setTextColor(INK);
  pdf.text(title.toUpperCase(), x + 10, startY + 17);
  pdf.setTextColor(255, 255, 255);
  pdf.text(sizeCode, x + w - valW / 2, startY + 17, { align: 'center' });
  pdf.setTextColor(INK);

  let y = startY + rowH;
  rows.forEach((row) => {
    pdf.rect(x, y, w - valW, rowH);
    pdf.rect(x + w - valW, y, valW, rowH);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(row.name.toUpperCase(), x + w - valW - 10, y + rowH / 2 + 3, {
      align: 'right',
    });
    pdf.setFont('helvetica', 'normal');
    pdf.text(row.value, x + w - valW / 2, y + rowH / 2 + 3, {
      align: 'center',
    });
    y += rowH;
  });

  return y;
}

/**
 * Build the 4-page DSPLN tech pack. Returns the jsPDF instance so the caller
 * decides whether to save, open, or attach it.
 */
export function generateTechPack(data: TechPackData): jsPDF {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  // --- Page 1: front + back renders ---
  let y = drawHeader(pdf, data.orderNumber);
  drawRenderPair(
    pdf,
    y,
    { url: data.renders.front, label: 'FRONT' },
    { url: data.renders.back, label: 'BACK' },
  );

  // --- Page 2: left + right renders ---
  pdf.addPage();
  y = drawHeader(pdf, data.orderNumber);
  drawRenderPair(
    pdf,
    y,
    { url: data.renders.left, label: 'LEFT' },
    { url: data.renders.right, label: 'RIGHT' },
  );

  // --- Page 3: QC spec sheet ---
  pdf.addPage();
  y = drawHeader(pdf, data.orderNumber);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text('QC', pdf.internal.pageSize.getWidth() - MARGIN, y, {
    align: 'right',
  });
  y += 10;

  const k = data.kimono;
  y = drawSpecSection(pdf, y, 'KIMONO SIZE:', k.size, [
    { label: 'Kimono Body Color', color: k.body },
    { label: 'Kimono Lapel Color', color: k.lapel },
    { label: 'Kimono Reinforcements Color', color: k.reinforcement },
    { label: 'Kimono Stitching Color', color: k.stitching },
    { label: 'Left Chest Logo', logo: k.logos.leftChest },
    { label: 'Left Sleeve Logo', logo: k.logos.leftSleeve },
    { label: 'Right Sleeve Logo', logo: k.logos.rightSleeve },
    { label: 'Big Back Logo', logo: k.logos.back },
  ]);

  y += 18;
  const b = data.belt;
  y = drawSpecSection(pdf, y, 'BELT SIZE:', b.size, [
    { label: 'Belt Color', color: b.color },
    { label: 'Left Belt End Text', value: b.leftEndText || 'NO TEXT' },
    { label: 'Right Belt End Text', value: b.rightEndText || 'NO TEXT' },
  ]);

  y += 18;
  const p = data.pant;
  drawSpecSection(pdf, y, 'PANT SIZE:', p.size, [
    { label: 'Pant Body Color', color: p.body },
    { label: 'Pant Reinforcements Color', color: p.reinforcement },
    { label: 'Pant Stitching Color', color: p.stitching },
    { label: 'Pant Drawcord Color', color: p.drawcord },
    { label: 'Left Thigh Logo', logo: p.logos.leftThigh },
    { label: 'Right Thigh Logo', logo: p.logos.rightThigh },
  ]);

  // --- Page 4: measurements for the ordered sizes ---
  pdf.addPage();
  y = drawHeader(pdf, data.orderNumber);
  y += 10;

  const kSpec = lookupSizeSpec(k.size);
  const dash = '—';
  y = drawMeasurementBlock(pdf, y, 'Kimono', k.size, [
    { name: 'Wing Span', value: kSpec ? String(kSpec.wingSpan) : dash },
    { name: 'Center Back', value: kSpec ? String(kSpec.centerBack) : dash },
    { name: 'Chest Width', value: kSpec ? String(kSpec.chestWidth) : dash },
    { name: 'Sleeve Opening', value: kSpec ? String(kSpec.sleeveOpening) : dash },
    { name: 'Side Slit', value: kSpec ? String(kSpec.sideSlit) : dash },
  ]);

  y += 24;
  const pSpec = lookupSizeSpec(p.size);
  drawMeasurementBlock(pdf, y, 'Pant', p.size, [
    { name: 'Waist', value: pSpec ? String(pSpec.waist) : dash },
    { name: 'Outseam (from back waist)', value: pSpec ? String(pSpec.outseam) : dash },
    { name: 'Front Rise', value: pSpec ? String(pSpec.frontRise) : dash },
    { name: 'Leg Opening', value: pSpec ? String(pSpec.legOpening) : dash },
  ]);

  return pdf;
}
