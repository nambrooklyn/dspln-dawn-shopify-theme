import jsPDF from 'jspdf';

import {
  RASHGUARD_ARTWORK_TARGET_LABELS,
  RASHGUARD_PART_LABELS,
  RASHGUARD_PARTS,
} from './rashguard-config';
import type { RashguardSerializedState } from './rashguard-state';

export { snapshotCanvas, snapshotCanvasCenteredThumbnail, snapshotCanvasThumbnail } from '../shared/export-pdf';

export function exportRashguardPdf({
  productName,
  spec,
  frontDataUrl,
  backDataUrl,
}: {
  productName: string;
  spec: RashguardSerializedState;
  frontDataUrl: string;
  backDataUrl: string;
}) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 36;
  const contentWidth = pageWidth - margin * 2;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text(productName, margin, margin + 8);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(110);
  pdf.text('Design mockup spec', margin, margin + 24);
  pdf.setTextColor(0);

  const imgW = (contentWidth - 12) / 2;
  const imgH = imgW;
  const imgY = margin + 50;
  try {
    pdf.addImage(frontDataUrl, 'PNG', margin, imgY, imgW, imgH);
  } catch {
    // Keep the PDF generation alive if a canvas snapshot is unavailable.
  }
  try {
    pdf.addImage(backDataUrl, 'PNG', margin + imgW + 12, imgY, imgW, imgH);
  } catch {
    // Keep the PDF generation alive if a canvas snapshot is unavailable.
  }

  pdf.setFontSize(9);
  pdf.setTextColor(110);
  pdf.text('Front', margin, imgY + imgH + 12);
  pdf.text('Back', margin + imgW + 12, imgY + imgH + 12);
  pdf.setTextColor(0);

  let y = imgY + imgH + 34;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('Configuration Details', margin, y);
  y += 16;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);

  [`Total: $${spec.price.total.toFixed(2)} ${spec.price.currency}`, `Size: ${spec.size}`].forEach(
    (line) => {
      pdf.text(line, margin, y);
      y += 14;
    },
  );

  y += 8;
  pdf.setFont('helvetica', 'bold');
  pdf.text('Colors', margin, y);
  y += 16;
  pdf.setFont('helvetica', 'normal');

  RASHGUARD_PARTS.forEach((part) => {
    const color = spec.partColors[part];
    pdf.setFillColor(color.hex);
    pdf.setDrawColor(180);
    pdf.rect(margin, y - 9, 12, 12, 'FD');
    pdf.text(
      `${RASHGUARD_PART_LABELS[part]}  ${color.name ?? 'Custom'}  ${color.hex}`,
      margin + 18,
      y,
    );
    y += 18;
  });

  y += 8;
  pdf.setFont('helvetica', 'bold');
  pdf.text('Artwork Layers', margin, y);
  y += 16;
  pdf.setFont('helvetica', 'normal');

  if (spec.artworkLayers.length === 0) {
    pdf.setTextColor(140);
    pdf.text('No artwork uploaded.', margin, y);
    pdf.setTextColor(0);
  } else {
    spec.artworkLayers.forEach((layer, index) => {
      pdf.text(
        `${index + 1}. ${layer.filename} on ${RASHGUARD_ARTWORK_TARGET_LABELS[layer.target]} (${layer.imageWidth} x ${layer.imageHeight}px)`,
        margin,
        y,
      );
      y += 14;
    });
  }

  pdf.setFontSize(8);
  pdf.setTextColor(150);
  pdf.text(
    `Generated ${new Date().toISOString()}`,
    margin,
    pdf.internal.pageSize.getHeight() - 24,
  );

  pdf.save(`${productName.replace(/\s+/g, '-').toLowerCase()}-mockup.pdf`);
}
