import { PDFDocument, PDFName, PDFString } from 'pdf-lib';

// Vendored sRGB IEC61966-2.1 ICC profile (public/color/sRGB.icc).
const SRGB_ICC_URL = '/color/sRGB.icc';

async function loadSrgbIcc(): Promise<Uint8Array | null> {
  try {
    const res = await fetch(SRGB_ICC_URL);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Tag a jsPDF-produced PDF with an sRGB OutputIntent so colour-managed apps
 * (Adobe Illustrator, Acrobat, print RIPs) treat it as RGB instead of guessing
 * CMYK. The pixel colours are already exact sRGB; this just declares the intent
 * so a viewer's default CMYK working space no longer dulls them. Falls back to
 * the untouched bytes if the profile can't be loaded or tagging fails.
 */
export async function withSrgbOutputIntent(
  pdfBytes: ArrayBuffer,
): Promise<Uint8Array> {
  const icc = await loadSrgbIcc();
  if (!icc) return new Uint8Array(pdfBytes);

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const ctx = pdfDoc.context;

  // Embed the ICC profile as an N=3 (RGB) stream.
  const iccStream = ctx.stream(icc, {
    N: 3,
    Alternate: PDFName.of('DeviceRGB'),
  });
  const iccRef = ctx.register(iccStream);

  const outputIntent = ctx.obj({
    Type: PDFName.of('OutputIntent'),
    S: PDFName.of('GTS_PDFA1'),
    OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    DestOutputProfile: iccRef,
  });
  const oiRef = ctx.register(outputIntent);

  pdfDoc.catalog.set(PDFName.of('OutputIntents'), ctx.obj([oiRef]));
  return pdfDoc.save();
}

/** Trigger a browser download of raw PDF bytes. */
export function downloadPdfBytes(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes as unknown as BlobPart], {
    type: 'application/pdf',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Base64-encode PDF bytes (for the 'datauri' output mode used in testing). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
