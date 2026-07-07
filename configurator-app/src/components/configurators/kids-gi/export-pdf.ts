import jsPDF from 'jspdf';

import {
  GI_PART_DISPLAY,
  KIMONO_LOGO_SLOT_LABEL,
  KIMONO_SUBPART_LABEL,
  PANT_LOGO_SLOT_LABEL,
  PANT_SUBPART_LABEL,
} from './gi-config';
import type { GiLayer, GiSerializedState } from './gi-state';

interface ExportPDFInput {
  productName: string;
  spec: GiSerializedState;
  layers: GiLayer[];
  // Two snapshots from the 3D canvas — front and back views.
  frontDataUrl: string;
  backDataUrl: string;
}

/**
 * Compose a mockup spec PDF from a pair of 3D canvas snapshots plus
 * the merchant's chosen colors and layer list.
 * Caller is responsible for capturing the front and back snapshots
 * (see GiConfigurator.handleExport).
 */
export function exportGiPdf({
  productName,
  spec,
  layers,
  frontDataUrl,
  backDataUrl,
}: ExportPDFInput) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;

  // Title
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text(productName, margin, margin + 8);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(110);
  pdf.text('Design mockup spec', margin, margin + 24);
  pdf.setTextColor(0);

  // Snapshots — front (left) + back (right)
  const imgW = (contentWidth - 12) / 2;
  const imgH = imgW; // square preview
  const imgY = margin + 50;
  try {
    pdf.addImage(frontDataUrl, 'PNG', margin, imgY, imgW, imgH);
  } catch {
    // Ignore failed image — keep PDF generation alive
  }
  try {
    pdf.addImage(backDataUrl, 'PNG', margin + imgW + 12, imgY, imgW, imgH);
  } catch {
    // ignore
  }

  pdf.setFontSize(9);
  pdf.setTextColor(110);
  pdf.text('Front', margin, imgY + imgH + 12);
  pdf.text('Back', margin + imgW + 12, imgY + imgH + 12);
  pdf.setTextColor(0);

  // Order/spec block
  let y = imgY + imgH + 32;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('Configuration Details', margin, y);
  y += 16;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);

  const lines: string[] = [
    `Total: $${spec.price.total.toFixed(2)} ${spec.price.currency}`,
    ...spec.price.lines.map(
      (line) =>
        `${GI_PART_DISPLAY[line.part]}: ${
          line.included ? `$${line.unitPrice.toFixed(2)}` : 'Removed'
        }`,
    ),
    `Kimono size: ${spec.kimono.size}`,
    `Belt size: ${spec.belt.size}`,
    `Pant size: ${spec.pant.size}`,
    `Belt left end text: ${spec.belt.embroidery.leftEnd || 'None'}`,
    `Belt left end font: ${spec.belt.embroidery.leftFont}`,
    `Belt right end text: ${spec.belt.embroidery.rightEnd || 'None'}`,
    `Belt right end font: ${spec.belt.embroidery.rightFont}`,
  ];

  lines.forEach((line) => {
    pdf.text(line, margin, y);
    y += 14;
  });

  y += 8;
  pdf.setFont('helvetica', 'bold');
  pdf.text('Colors', margin, y);
  y += 16;
  pdf.setFont('helvetica', 'normal');

  const colorRows = [
    ...Object.entries(spec.kimono.colors).map(([part, color]) => ({
      label: KIMONO_SUBPART_LABEL[part as keyof typeof KIMONO_SUBPART_LABEL],
      color,
    })),
    ...Object.entries(spec.pant.colors).map(([part, color]) => ({
      label: PANT_SUBPART_LABEL[part as keyof typeof PANT_SUBPART_LABEL],
      color,
    })),
    {
      label: 'Belt Color',
      color: spec.belt.color,
    },
    {
      label: 'Left Belt End Text Color',
      color: {
        hex: spec.belt.embroidery.leftThreadColor,
        name: spec.belt.embroidery.leftThreadColorName,
      },
    },
    {
      label: 'Right Belt End Text Color',
      color: {
        hex: spec.belt.embroidery.rightThreadColor,
        name: spec.belt.embroidery.rightThreadColorName,
      },
    },
  ];

  colorRows.forEach(({ label, color }) => {
    const swatchX = margin;
    const swatchY = y - 8;
    pdf.setFillColor(color.hex);
    pdf.setDrawColor(180);
    pdf.rect(swatchX, swatchY, 12, 12, 'FD');
    pdf.text(
      `${label}  ${color.name ?? 'Custom'}  ${color.hex}`,
      swatchX + 18,
      y + 1,
    );
    y += 18;
  });

  // Logos block
  y += 6;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('Uploaded Logos', margin, y);
  y += 16;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  const logoEntries = Object.entries(spec.kimono.logos);
  const pantLogoEntries = Object.entries(spec.pant.logos);
  if (
    logoEntries.length === 0 &&
    pantLogoEntries.length === 0 &&
    layers.length === 0
  ) {
    pdf.setTextColor(140);
    pdf.text('No logos uploaded.', margin, y);
    pdf.setTextColor(0);
  } else {
    logoEntries.forEach(([slot, logo]) => {
      const label =
        KIMONO_LOGO_SLOT_LABEL[slot as keyof typeof KIMONO_LOGO_SLOT_LABEL];
      const line = `${label}: ${logo.filename} (${logo.imageWidth} x ${logo.imageHeight}px)`;
      pdf.text(line, margin, y);
      y += 14;
    });
    pantLogoEntries.forEach(([slot, logo]) => {
      const label =
        PANT_LOGO_SLOT_LABEL[slot as keyof typeof PANT_LOGO_SLOT_LABEL];
      const line = `${label}: ${logo.filename} (${logo.imageWidth} x ${logo.imageHeight}px)`;
      pdf.text(line, margin, y);
      y += 14;
    });
  }

  // Footer
  pdf.setFontSize(8);
  pdf.setTextColor(150);
  pdf.text(
    `Generated ${new Date().toISOString()}`,
    margin,
    pdf.internal.pageSize.getHeight() - 24,
  );

  const fileName = `${productName.replace(/\s+/g, '-').toLowerCase()}-mockup.pdf`;
  pdf.save(fileName);
}

/**
 * Capture a snapshot of the current 3D scene as a PNG data URL.
 * Relies on `preserveDrawingBuffer: true` on the WebGL renderer
 * (set in gi-canvas.tsx).
 */
export function snapshotCanvas(
  canvasEl: HTMLCanvasElement | null,
): string | null {
  if (!canvasEl) return null;
  try {
    return canvasEl.toDataURL('image/png');
  } catch {
    return null;
  }
}

export function snapshotCanvasThumbnail(
  canvasEl: HTMLCanvasElement | null,
  maxWidth = 640,
  quality = 0.82,
): string | null {
  if (!canvasEl) return null;

  try {
    const sourceWidth = canvasEl.width;
    const sourceHeight = canvasEl.height;
    if (!sourceWidth || !sourceHeight) return null;

    const scale = Math.min(1, maxWidth / sourceWidth);
    const outputWidth = Math.round(sourceWidth * scale);
    const outputHeight = Math.round(sourceHeight * scale);
    const thumbnailCanvas = document.createElement('canvas');
    thumbnailCanvas.width = outputWidth;
    thumbnailCanvas.height = outputHeight;

    const context = thumbnailCanvas.getContext('2d');
    if (!context) return null;

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, outputWidth, outputHeight);
    context.drawImage(canvasEl, 0, 0, outputWidth, outputHeight);

    return thumbnailCanvas.toDataURL('image/jpeg', quality);
  } catch {
    return null;
  }
}

export function snapshotCanvasCenteredThumbnail(
  canvasEl: HTMLCanvasElement | null,
  outputSize = 720,
  quality = 0.84,
): string | null {
  if (!canvasEl) return null;

  try {
    const sourceWidth = canvasEl.width;
    const sourceHeight = canvasEl.height;
    if (!sourceWidth || !sourceHeight) return null;

    const cropSize = Math.min(sourceWidth, sourceHeight);
    const cropX = Math.max(0, Math.round((sourceWidth - cropSize) / 2));
    const cropY = Math.max(0, Math.round((sourceHeight - cropSize) / 2));

    const thumbnailCanvas = document.createElement('canvas');
    thumbnailCanvas.width = outputSize;
    thumbnailCanvas.height = outputSize;

    const context = thumbnailCanvas.getContext('2d');
    if (!context) return null;

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, outputSize, outputSize);
    context.drawImage(
      canvasEl,
      cropX,
      cropY,
      cropSize,
      cropSize,
      0,
      0,
      outputSize,
      outputSize,
    );

    return thumbnailCanvas.toDataURL('image/jpeg', quality);
  } catch {
    return null;
  }
}
