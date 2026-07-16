import jsPDF from 'jspdf';

import type {
  GiSerializedState,
  KimonoLogo,
} from '../gi/gi-state';
import {
  KIMONO_LOGO_ANCHORS,
  KIMONO_LOGO_SLOT_LABEL,
  PANT_LOGO_ANCHORS,
  PANT_LOGO_SLOT_LABEL,
  fontCssForBeltFont,
  type KimonoLogoSlot,
  type PantLogoSlot,
} from '../gi/gi-config';

interface GenerateGiTechPackInput {
  spec: GiSerializedState;
  frontDataUrl: string;
  backDataUrl: string;
  leftSideDataUrl?: string;
  rightSideDataUrl?: string;
  leftBeltEndDataUrl?: string;
  rightBeltEndDataUrl?: string;
  kimonoLogos?: Partial<Record<KimonoLogoSlot, KimonoLogo>>;
  pantLogos?: Partial<Record<PantLogoSlot, KimonoLogo>>;
  orderDate?: Date;
  orderNumber?: string;
  productName?: string;
  includeSizeMeasurements?: boolean;
  /** Kids model proportions differ — shifts the thigh placement crop. */
  kidsProportions?: boolean;
}

/** Filesystem-safe slug for the download filename (keeps digits + letters). */
function fileNameSlug(value: string, fallback: string) {
  const slug = value
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return slug || fallback;
}

const LOGO_URL = '/tech-pack/dspln-logo.png';
const KIMONO_POM_URL = '/tech-pack/kimono-point-of-measurement.png';
const PANT_POM_URL = '/tech-pack/pant-point-of-measurement.png';
const BRANDING_URL = '/tech-pack/dspln-branding.svg';

type TechPackImage = {
  dataUrl: string;
  width: number;
  height: number;
};

type CropRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type SizeMeasurement = {
  label: string;
  value: string;
};

const KIMONO_SIZE_MEASUREMENTS: Record<string, SizeMeasurement[]> = {
  A00S: [
    { label: 'Wing Span', value: '142' },
    { label: 'Center Back', value: '64' },
    { label: 'Chest Width', value: '50' },
    { label: 'Sleeve Opening', value: '15.25' },
    { label: 'Side Slit', value: '13' },
  ],
  A00: [
    { label: 'Wing Span', value: '150' },
    { label: 'Center Back', value: '68' },
    { label: 'Chest Width', value: '50' },
    { label: 'Sleeve Opening', value: '15.25' },
    { label: 'Side Slit', value: '14' },
  ],
  A00L: [
    { label: 'Wing Span', value: '158' },
    { label: 'Center Back', value: '72' },
    { label: 'Chest Width', value: '50' },
    { label: 'Sleeve Opening', value: '15.25' },
    { label: 'Side Slit', value: '15' },
  ],
  A0S: [
    { label: 'Wing Span', value: '150' },
    { label: 'Center Back', value: '68' },
    { label: 'Chest Width', value: '54' },
    { label: 'Sleeve Opening', value: '15.75' },
    { label: 'Side Slit', value: '14' },
  ],
  A0: [
    { label: 'Wing Span', value: '158' },
    { label: 'Center Back', value: '72' },
    { label: 'Chest Width', value: '54' },
    { label: 'Sleeve Opening', value: '15.75' },
    { label: 'Side Slit', value: '15' },
  ],
  A0L: [
    { label: 'Wing Span', value: '164' },
    { label: 'Center Back', value: '75' },
    { label: 'Chest Width', value: '54' },
    { label: 'Sleeve Opening', value: '15.75' },
    { label: 'Side Slit', value: '16' },
  ],
  A1S: [
    { label: 'Wing Span', value: '158' },
    { label: 'Center Back', value: '72' },
    { label: 'Chest Width', value: '59' },
    { label: 'Sleeve Opening', value: '16.25' },
    { label: 'Side Slit', value: '15' },
  ],
  A1: [
    { label: 'Wing Span', value: '164' },
    { label: 'Center Back', value: '75' },
    { label: 'Chest Width', value: '59' },
    { label: 'Sleeve Opening', value: '16.25' },
    { label: 'Side Slit', value: '16' },
  ],
  A1L: [
    { label: 'Wing Span', value: '175' },
    { label: 'Center Back', value: '79' },
    { label: 'Chest Width', value: '59' },
    { label: 'Sleeve Opening', value: '16.25' },
    { label: 'Side Slit', value: '17' },
  ],
  A2S: [
    { label: 'Wing Span', value: '164' },
    { label: 'Center Back', value: '75' },
    { label: 'Chest Width', value: '63' },
    { label: 'Sleeve Opening', value: '16.5' },
    { label: 'Side Slit', value: '16' },
  ],
  A2: [
    { label: 'Wing Span', value: '175' },
    { label: 'Center Back', value: '79' },
    { label: 'Chest Width', value: '63' },
    { label: 'Sleeve Opening', value: '16.5' },
    { label: 'Side Slit', value: '17' },
  ],
  A2L: [
    { label: 'Wing Span', value: '180' },
    { label: 'Center Back', value: '84' },
    { label: 'Chest Width', value: '63' },
    { label: 'Sleeve Opening', value: '16.5' },
    { label: 'Side Slit', value: '18' },
  ],
  A3S: [
    { label: 'Wing Span', value: '175' },
    { label: 'Center Back', value: '79' },
    { label: 'Chest Width', value: '67' },
    { label: 'Sleeve Opening', value: '17' },
    { label: 'Side Slit', value: '17' },
  ],
  A3: [
    { label: 'Wing Span', value: '180' },
    { label: 'Center Back', value: '84' },
    { label: 'Chest Width', value: '67' },
    { label: 'Sleeve Opening', value: '17' },
    { label: 'Side Slit', value: '18' },
  ],
  A3L: [
    { label: 'Wing Span', value: '188' },
    { label: 'Center Back', value: '87' },
    { label: 'Chest Width', value: '67' },
    { label: 'Sleeve Opening', value: '17' },
    { label: 'Side Slit', value: '19' },
  ],
  A4S: [
    { label: 'Wing Span', value: '180' },
    { label: 'Center Back', value: '84' },
    { label: 'Chest Width', value: '71' },
    { label: 'Sleeve Opening', value: '17.5' },
    { label: 'Side Slit', value: '18' },
  ],
  A4: [
    { label: 'Wing Span', value: '188' },
    { label: 'Center Back', value: '87' },
    { label: 'Chest Width', value: '71' },
    { label: 'Sleeve Opening', value: '17.5' },
    { label: 'Side Slit', value: '19' },
  ],
  A4L: [
    { label: 'Wing Span', value: '190' },
    { label: 'Center Back', value: '90' },
    { label: 'Chest Width', value: '71' },
    { label: 'Sleeve Opening', value: '17.5' },
    { label: 'Side Slit', value: '20' },
  ],
  A5S: [
    { label: 'Wing Span', value: '188' },
    { label: 'Center Back', value: '87' },
    { label: 'Chest Width', value: '74' },
    { label: 'Sleeve Opening', value: '18' },
    { label: 'Side Slit', value: '19' },
  ],
  A5: [
    { label: 'Wing Span', value: '190' },
    { label: 'Center Back', value: '90' },
    { label: 'Chest Width', value: '74' },
    { label: 'Sleeve Opening', value: '18' },
    { label: 'Side Slit', value: '20' },
  ],
  A5L: [
    { label: 'Wing Span', value: '198' },
    { label: 'Center Back', value: '93' },
    { label: 'Chest Width', value: '74' },
    { label: 'Sleeve Opening', value: '18' },
    { label: 'Side Slit', value: '21' },
  ],
  A6S: [
    { label: 'Wing Span', value: '190' },
    { label: 'Center Back', value: '90' },
    { label: 'Chest Width', value: '80' },
    { label: 'Sleeve Opening', value: '19' },
    { label: 'Side Slit', value: '20' },
  ],
  A6: [
    { label: 'Wing Span', value: '198' },
    { label: 'Center Back', value: '93' },
    { label: 'Chest Width', value: '80' },
    { label: 'Sleeve Opening', value: '19' },
    { label: 'Side Slit', value: '20' },
  ],
  A6L: [
    { label: 'Wing Span', value: '216' },
    { label: 'Center Back', value: '96' },
    { label: 'Chest Width', value: '80' },
    { label: 'Sleeve Opening', value: '19' },
    { label: 'Side Slit', value: '20' },
  ],
};

const PANT_SIZE_MEASUREMENTS: Record<string, SizeMeasurement[]> = {
  A00S: [
    { label: 'Waist', value: '46' },
    { label: 'Outseam', value: '91' },
    { label: 'Front Rise', value: '31' },
    { label: 'Leg Opening', value: '22' },
  ],
  A00: [
    { label: 'Waist', value: '46' },
    { label: 'Outseam', value: '94' },
    { label: 'Front Rise', value: '32' },
    { label: 'Leg Opening', value: '22' },
  ],
  A00L: [
    { label: 'Waist', value: '46' },
    { label: 'Outseam', value: '97.5' },
    { label: 'Front Rise', value: '33' },
    { label: 'Leg Opening', value: '22' },
  ],
  A0S: [
    { label: 'Waist', value: '50' },
    { label: 'Outseam', value: '94' },
    { label: 'Front Rise', value: '32' },
    { label: 'Leg Opening', value: '22' },
  ],
  A0: [
    { label: 'Waist', value: '50' },
    { label: 'Outseam', value: '97.5' },
    { label: 'Front Rise', value: '33' },
    { label: 'Leg Opening', value: '22' },
  ],
  A0L: [
    { label: 'Waist', value: '50' },
    { label: 'Outseam', value: '100.5' },
    { label: 'Front Rise', value: '34' },
    { label: 'Leg Opening', value: '22' },
  ],
  A1S: [
    { label: 'Waist', value: '52' },
    { label: 'Outseam', value: '97.5' },
    { label: 'Front Rise', value: '33' },
    { label: 'Leg Opening', value: '22' },
  ],
  A1: [
    { label: 'Waist', value: '52' },
    { label: 'Outseam', value: '100.5' },
    { label: 'Front Rise', value: '34' },
    { label: 'Leg Opening', value: '22' },
  ],
  A1L: [
    { label: 'Waist', value: '52' },
    { label: 'Outseam', value: '104.5' },
    { label: 'Front Rise', value: '35' },
    { label: 'Leg Opening', value: '22' },
  ],
  A2S: [
    { label: 'Waist', value: '57' },
    { label: 'Outseam', value: '100.5' },
    { label: 'Front Rise', value: '34' },
    { label: 'Leg Opening', value: '23' },
  ],
  A2: [
    { label: 'Waist', value: '57' },
    { label: 'Outseam', value: '104.5' },
    { label: 'Front Rise', value: '35' },
    { label: 'Leg Opening', value: '23' },
  ],
  A2L: [
    { label: 'Waist', value: '57' },
    { label: 'Outseam', value: '109.5' },
    { label: 'Front Rise', value: '36' },
    { label: 'Leg Opening', value: '23' },
  ],
  A3S: [
    { label: 'Waist', value: '60' },
    { label: 'Outseam', value: '104.5' },
    { label: 'Front Rise', value: '35' },
    { label: 'Leg Opening', value: '24' },
  ],
  A3: [
    { label: 'Waist', value: '60' },
    { label: 'Outseam', value: '109.5' },
    { label: 'Front Rise', value: '36' },
    { label: 'Leg Opening', value: '24' },
  ],
  A3L: [
    { label: 'Waist', value: '60' },
    { label: 'Outseam', value: '112.5' },
    { label: 'Front Rise', value: '37' },
    { label: 'Leg Opening', value: '25' },
  ],
  A4S: [
    { label: 'Waist', value: '66' },
    { label: 'Outseam', value: '109.5' },
    { label: 'Front Rise', value: '36' },
    { label: 'Leg Opening', value: '25' },
  ],
  A4: [
    { label: 'Waist', value: '66' },
    { label: 'Outseam', value: '112.5' },
    { label: 'Front Rise', value: '37' },
    { label: 'Leg Opening', value: '25' },
  ],
  A4L: [
    { label: 'Waist', value: '66' },
    { label: 'Outseam', value: '115.5' },
    { label: 'Front Rise', value: '38' },
    { label: 'Leg Opening', value: '25' },
  ],
  A5S: [
    { label: 'Waist', value: '69' },
    { label: 'Outseam', value: '112.5' },
    { label: 'Front Rise', value: '37' },
    { label: 'Leg Opening', value: '26' },
  ],
  A5: [
    { label: 'Waist', value: '69' },
    { label: 'Outseam', value: '115.5' },
    { label: 'Front Rise', value: '38' },
    { label: 'Leg Opening', value: '26' },
  ],
  A5L: [
    { label: 'Waist', value: '69' },
    { label: 'Outseam', value: '119' },
    { label: 'Front Rise', value: '39' },
    { label: 'Leg Opening', value: '26' },
  ],
  A6S: [
    { label: 'Waist', value: '69' },
    { label: 'Outseam', value: '112.5' },
    { label: 'Front Rise', value: '37' },
    { label: 'Leg Opening', value: '26' },
  ],
  A6: [
    { label: 'Waist', value: '69' },
    { label: 'Outseam', value: '115.5' },
    { label: 'Front Rise', value: '38' },
    { label: 'Leg Opening', value: '26' },
  ],
  A6L: [
    { label: 'Waist', value: '69' },
    { label: 'Outseam', value: '119' },
    { label: 'Front Rise', value: '39' },
    { label: 'Leg Opening', value: '26' },
  ],
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(date);
}

function buildOrderNumber(date: Date) {
  return String(1000 + (date.getTime() % 9000)).padStart(4, '0');
}

async function loadImageDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load image asset: ${url}`);
  }
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });
}

async function renderHeaderDataUrl({
  logoDataUrl,
  orderDate,
  shipDate,
  orderNumber,
}: {
  logoDataUrl: string;
  orderDate: Date;
  shipDate: Date;
  orderNumber: string;
}) {
  const scale = 4;
  const widthPt = 558;
  const heightPt = 34;
  const canvas = document.createElement('canvas');
  canvas.width = widthPt * scale;
  canvas.height = heightPt * scale;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create tech pack header');
  }

  context.scale(scale, scale);
  context.clearRect(0, 0, widthPt, heightPt);
  context.strokeStyle = '#111111';
  context.lineWidth = 0.75;
  context.beginPath();
  context.moveTo(0, 0.5);
  context.lineTo(widthPt, 0.5);
  context.moveTo(0, heightPt - 0.5);
  context.lineTo(widthPt, heightPt - 0.5);
  context.stroke();

  try {
    const logo = await loadImage(logoDataUrl);
    context.drawImage(logo, 0, 9, 124, 16.5);
  } catch {
    context.fillStyle = '#000000';
    context.font = '700 18px Arial, Helvetica, sans-serif';
    context.fillText('DSPLN', 0, 23);
  }

  const y = 22.5;
  const groups = [
    { label: 'DATE', value: formatDate(orderDate) },
    { label: 'SHIP DATE', value: formatDate(shipDate) },
    { label: 'ORDER NUMBER', value: orderNumber },
  ];
  const labelFont = '400 7px Arial, Helvetica, sans-serif';
  const valueFont = '700 9px Arial, Helvetica, sans-serif';
  const labelValueGap = 10;
  const groupGap = 30;
  let x = 210;

  context.textBaseline = 'alphabetic';
  groups.forEach((group) => {
    context.fillStyle = '#5c5c5c';
    context.font = labelFont;
    context.textAlign = 'left';
    context.fillText(group.label, x, y);
    x += context.measureText(group.label).width + labelValueGap;

    context.fillStyle = '#000000';
    context.font = valueFont;
    context.fillText(group.value, x, y);
    x += context.measureText(group.value).width + groupGap;
  });

  return canvas.toDataURL('image/png');
}

async function cropToVisibleSubject(dataUrl: string) {
  const image = await loadImage(dataUrl);
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = image.width;
  sourceCanvas.height = image.height;

  const sourceContext = sourceCanvas.getContext('2d', {
    willReadFrequently: true,
  });

  if (!sourceContext) {
    return { dataUrl, width: image.width, height: image.height };
  }

  sourceContext.drawImage(image, 0, 0);
  const imageData = sourceContext.getImageData(0, 0, image.width, image.height);
  const pixels = imageData.data;

  // Convert only the edge-connected white studio background to alpha.
  // This keeps white garment details (belt, labels, stitching) intact because
  // they are not connected to the outer image border.
  const visited = new Uint8Array(image.width * image.height);
  const queue: number[] = [];
  const enqueue = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
    const pixelIndex = y * image.width + x;
    if (visited[pixelIndex]) return;
    visited[pixelIndex] = 1;
    queue.push(pixelIndex);
  };
  const isBackgroundPixel = (pixelIndex: number) => {
    const index = pixelIndex * 4;
    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    const alpha = pixels[index + 3];
    return alpha > 0 && r >= 238 && g >= 238 && b >= 238;
  };

  for (let x = 0; x < image.width; x += 1) {
    enqueue(x, 0);
    enqueue(x, image.height - 1);
  }
  for (let y = 0; y < image.height; y += 1) {
    enqueue(0, y);
    enqueue(image.width - 1, y);
  }

  while (queue.length > 0) {
    const pixelIndex = queue.shift();
    if (pixelIndex === undefined || !isBackgroundPixel(pixelIndex)) continue;

    const index = pixelIndex * 4;
    pixels[index + 3] = 0;

    const x = pixelIndex % image.width;
    const y = Math.floor(pixelIndex / image.width);
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  sourceContext.putImageData(imageData, 0, 0);

  let minX = image.width;
  let minY = image.height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < image.height; y += 2) {
    for (let x = 0; x < image.width; x += 2) {
      const index = (y * image.width + x) * 4;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const alpha = pixels[index + 3];
      const isSubject = alpha > 24 && (r < 248 || g < 248 || b < 248);

      if (!isSubject) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (minX >= maxX || minY >= maxY) {
    return { dataUrl, width: image.width, height: image.height };
  }

  const subjectWidth = maxX - minX;
  const subjectHeight = maxY - minY;
  const padding = Math.round(Math.max(subjectWidth, subjectHeight) * 0.012);
  const cropX = Math.max(0, minX - padding);
  const cropY = Math.max(0, minY - padding);
  const cropWidth = Math.min(image.width - cropX, subjectWidth + padding * 2);
  const cropHeight = Math.min(image.height - cropY, subjectHeight + padding * 2);

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropWidth;
  cropCanvas.height = cropHeight;
  const cropContext = cropCanvas.getContext('2d');

  if (!cropContext) {
    return { dataUrl, width: image.width, height: image.height };
  }

  cropContext.clearRect(0, 0, cropWidth, cropHeight);
  cropContext.imageSmoothingEnabled = true;
  cropContext.imageSmoothingQuality = 'high';
  cropContext.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );

  return {
    // Photographic render on a white ground: JPEG is ~20-50x smaller than the
    // PNG this used to emit, at print-indistinguishable quality.
    dataUrl: cropCanvas.toDataURL('image/jpeg', 0.95),
    width: cropWidth,
    height: cropHeight,
  };
}

// Static assets (e.g. the point-of-measurement diagrams) ship at absurd
// source resolution — the kimono POM is 7500px and used to embed ~100MB of
// raw pixels into EVERY gi tech pack. Bound to the page's true print ceiling.
const STATIC_ASSET_MAX_PX = 2400;

async function loadTechPackImage(url: string): Promise<TechPackImage> {
  const dataUrl = await loadImageDataUrl(url);
  const image = await loadImage(dataUrl);
  const sourceMax = Math.max(image.width, image.height);
  if (!sourceMax) {
    return { dataUrl, width: image.width, height: image.height };
  }
  const scale = Math.min(1, STATIC_ASSET_MAX_PX / sourceMax);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return { dataUrl, width: image.width, height: image.height };
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  // Diagrams render on white pages — flatten + JPEG (a transparent PNG is
  // stored by jsPDF as raw pixels + mask, ~20MB per diagram).
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.92), width, height };
}

async function loadSvgTechPackPage(url: string): Promise<TechPackImage> {
  const dataUrl = await loadImageDataUrl(url);
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = 1224;
  canvas.height = 1584;
  const context = canvas.getContext('2d');

  if (!context) {
    return { dataUrl, width: image.width, height: image.height };
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return {
    // White-filled page render: JPEG, massively smaller than PNG.
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
    width: canvas.width,
    height: canvas.height,
  };
}

async function cropTechPackImage(image: TechPackImage, region: CropRegion) {
  const source = await loadImage(image.dataUrl);
  const cropX = Math.max(0, Math.round(source.width * region.x));
  const cropY = Math.max(0, Math.round(source.height * region.y));
  const cropWidth = Math.min(
    source.width - cropX,
    Math.round(source.width * region.width),
  );
  const cropHeight = Math.min(
    source.height - cropY,
    Math.round(source.height * region.height),
  );

  const canvas = document.createElement('canvas');
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const context = canvas.getContext('2d');

  if (!context || cropWidth <= 0 || cropHeight <= 0) {
    return image;
  }

  context.clearRect(0, 0, cropWidth, cropHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    source,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );

  return {
    // Crops of photographic renders: JPEG (see cropToVisibleSubject). Second
    // JPEG pass over an already-JPEG capture — keep quality high so the
    // generation loss stays invisible.
    dataUrl: canvas.toDataURL('image/jpeg', 0.95),
    width: cropWidth,
    height: cropHeight,
  };
}

function addImageFit(
  pdf: jsPDF,
  image: TechPackImage,
  box: { x: number; y: number; width: number; height: number },
) {
  const scale = Math.min(box.width / image.width, box.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = box.x + (box.width - width) / 2;
  const y = box.y + (box.height - height) / 2;

  pdf.addImage(image.dataUrl, 'PNG', x, y, width, height);
}

function renderBeltTextArtwork({
  text,
  color,
  fontName,
}: {
  text: string;
  color: string;
  fontName: string;
}): TechPackImage {
  const canvas = document.createElement('canvas');
  canvas.width = 1800;
  canvas.height = 460;
  const context = canvas.getContext('2d');
  const clean = text.trim().toUpperCase();

  if (!context || !clean) {
    return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `900 ${Math.max(170, Math.min(310, 2100 / Math.max(clean.length, 6)))}px ${fontCssForBeltFont(fontName)}`;
  context.fillText(clean, canvas.width / 2, canvas.height / 2, canvas.width * 0.92);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  };
}

/** Sampled alpha check — opaque artwork can embed as JPEG (~10-50x smaller). */
function contextHasTransparency(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  try {
    const data = context.getImageData(0, 0, width, height).data;
    for (let i = 3; i < data.length; i += 4 * 64) {
      if (data[i] < 250) return true;
    }
    return false;
  } catch {
    return true;
  }
}

/**
 * Resample a logo to its placement's print ceiling (300 DPI at the largest
 * printed dimension for that slot). jsPDF embeds the SOURCE image bytes no
 * matter how small it is drawn on the page, so oversized uploads used to ride
 * into the tech pack at full weight — the main driver of 100MB+ art files.
 * Opaque artwork re-encodes as JPEG; transparency stays PNG. Also inlines
 * remote (CDN) logo URLs as data URLs so every page can embed them.
 */
async function resampleLogoForPrint(
  logo: KimonoLogo,
  maxPx: number,
): Promise<KimonoLogo> {
  try {
    if (!logo.imageUrl) return logo;
    const dataUrl = logo.imageUrl.startsWith('data:')
      ? logo.imageUrl
      : await loadImageDataUrl(logo.imageUrl);
    const image = await loadImage(dataUrl);
    const sourceMax = Math.max(image.naturalWidth, image.naturalHeight);
    if (!sourceMax) return logo;
    if (sourceMax <= maxPx) {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) return { ...logo, imageUrl: dataUrl };
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      return {
        ...logo,
        imageUrl: canvas.toDataURL('image/jpeg', 0.92),
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
      };
    }
    const scale = maxPx / sourceMax;
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return logo;
    // Flatten onto white + JPEG: every tech-pack surface draws artwork on a
    // white box, so this is visually identical on the page — while a PNG with
    // an alpha channel is stored by jsPDF as raw pixels + a separate mask
    // (a 3000px logo ballooned to ~34MB inside the PDF). The design record
    // keeps the original transparent file; this only affects the PDF embed.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const output = canvas.toDataURL('image/jpeg', 0.92);
    return { ...logo, imageUrl: output, imageWidth: width, imageHeight: height };
  } catch {
    return logo;
  }
}

async function resampleLogosForPrint<TSlot extends string>(
  logos: Partial<Record<TSlot, KimonoLogo>> | undefined,
  maxPxForSlot: (slot: TSlot) => number,
): Promise<Partial<Record<TSlot, KimonoLogo>> | undefined> {
  if (!logos) return logos;
  const entries = await Promise.all(
    (Object.entries(logos) as [TSlot, KimonoLogo | undefined][]).map(
      async ([slot, logo]) => {
        if (!logo) return null;
        return [slot, await resampleLogoForPrint(logo, maxPxForSlot(slot))] as const;
      },
    ),
  );
  return entries.reduce<Partial<Record<TSlot, KimonoLogo>>>((acc, entry) => {
    if (entry) acc[entry[0]] = entry[1];
    return acc;
  }, {});
}

function logoImage(logo: KimonoLogo): TechPackImage {
  return {
    dataUrl: logo.imageUrl,
    width: logo.imageWidth || 1,
    height: logo.imageHeight || 1,
  };
}

function fmtInches(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/g, '').replace(/\.$/, '');
}

function measurementText(widthIn: number, heightIn: number) {
  if (Math.abs(widthIn - heightIn) < 0.05) {
    return `${fmtInches(widthIn)}" W x ${fmtInches(heightIn)}" H`;
  }
  return widthIn > heightIn
    ? `${fmtInches(widthIn)}" WIDE`
    : `${fmtInches(heightIn)}" IN HEIGHT`;
}

function drawMeasurementArrow({
  pdf,
  x1,
  x2,
  y,
  label,
}: {
  pdf: jsPDF;
  x1: number;
  x2: number;
  y: number;
  label: string;
}) {
  pdf.setDrawColor(255, 0, 0);
  pdf.setTextColor(255, 0, 0);
  pdf.setLineWidth(0.7);
  pdf.line(x1, y, x2, y);
  pdf.line(x1, y, x1 + 5, y - 3);
  pdf.line(x1, y, x1 + 5, y + 3);
  pdf.line(x2, y, x2 - 5, y - 3);
  pdf.line(x2, y, x2 - 5, y + 3);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text(label, (x1 + x2) / 2, y + 25, { align: 'center' });
  pdf.setTextColor(0);
}

function drawVerticalMeasurementArrow({
  pdf,
  x,
  y1,
  y2,
  label,
}: {
  pdf: jsPDF;
  x: number;
  y1: number;
  y2: number;
  label: string;
}) {
  pdf.setDrawColor(255, 0, 0);
  pdf.setTextColor(255, 0, 0);
  pdf.setLineWidth(0.7);
  pdf.line(x, y1, x, y2);
  pdf.line(x, y1, x - 3, y1 + 5);
  pdf.line(x, y1, x + 3, y1 + 5);
  pdf.line(x, y2, x - 3, y2 - 5);
  pdf.line(x, y2, x + 3, y2 - 5);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text(label, x + 18, (y1 + y2) / 2 + 6);
  pdf.setTextColor(0);
}

function drawCheckbox(pdf: jsPDF, x: number, y: number) {
  pdf.setDrawColor(70);
  pdf.setLineWidth(0.5);
  pdf.rect(x, y, 20, 20);
}

function drawColorChip(pdf: jsPDF, colorHex: string, x: number, y: number) {
  pdf.setFillColor(colorHex);
  pdf.setDrawColor(70);
  pdf.setLineWidth(0.35);
  pdf.rect(x, y - 12, 18.75, 18.75, 'FD');
}

function valueText(value: string | null | undefined) {
  return (value || 'Custom').toUpperCase();
}

function logoForSlot(
  logos:
    | Partial<Record<KimonoLogoSlot, KimonoLogo>>
    | Partial<Record<PantLogoSlot, KimonoLogo>>
    | undefined,
  slot: string,
) {
  return logos?.[slot as never] as KimonoLogo | undefined;
}

function drawLogoValue({
  pdf,
  logo,
  x,
  y,
}: {
  pdf: jsPDF;
  logo?: KimonoLogo;
  x: number;
  y: number;
}) {
  if (!logo) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(0);
    pdf.text('NO', x, y);
    return;
  }

  const maxW = 22.5;
  const maxH = 16.875;
  const ratio = logo.imageWidth && logo.imageHeight
    ? Math.min(maxW / logo.imageWidth, maxH / logo.imageHeight)
    : 1;
  const width = Math.max(4, (logo.imageWidth || maxW) * ratio);
  const height = Math.max(4, (logo.imageHeight || maxH) * ratio);

  try {
    pdf.addImage(logo.imageUrl, 'PNG', x, y - height + 5, width, height);
  } catch {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('YES', x, y);
    return;
  }
}

type SummaryRow =
  | {
      label: string;
      kind: 'text';
      value: string;
    }
  | {
      label: string;
      kind: 'color';
      colorHex: string;
      value: string;
    }
  | {
      label: string;
      kind: 'logo';
      logo?: KimonoLogo;
    };

function drawSummarySection({
  pdf,
  title,
  size,
  rows,
  y,
  notOrdered = false,
}: {
  pdf: jsPDF;
  title: string;
  size: string;
  rows: SummaryRow[];
  y: number;
  notOrdered?: boolean;
}): number {
  const x = 14;
  const width = 584;
  const titleHeight = 34;
  const rowHeight = 23;
  // When a part wasn't purchased, collapse the block to just its title bar with
  // a hard "NO" and no customization rows — the factory makes only what's bought.
  const effectiveRows = notOrdered ? [] : rows;
  const height = titleHeight + effectiveRows.length * rowHeight;
  const labelX = 244;
  const valueX = 314;
  const checkboxX = x + width - 32;

  pdf.setDrawColor(30);
  pdf.setLineWidth(0.7);
  pdf.rect(x, y, width, height);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.setTextColor(35);
  pdf.text(notOrdered ? `${title}:` : `${title} SIZE:`, labelX, y + 23, {
    align: 'right',
  });
  pdf.text(notOrdered ? 'NO' : size, valueX, y + 23);
  drawCheckbox(pdf, checkboxX, y + 7);

  if (effectiveRows.length > 0) {
    pdf.setLineWidth(0.35);
    pdf.line(x, y + titleHeight, x + width, y + titleHeight);
  }

  effectiveRows.forEach((row, index) => {
    const rowTop = y + titleHeight + index * rowHeight;
    const textY = rowTop + 15.5;
    if (index > 0) {
      pdf.line(x, rowTop, x + width, rowTop);
    }

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(20);
    pdf.text(row.label, labelX, textY, { align: 'right' });

    if (row.kind === 'color') {
      drawColorChip(pdf, row.colorHex, valueX, rowTop + rowHeight / 2 + 3);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text(row.value, valueX + 34, textY);
    } else if (row.kind === 'logo') {
      drawLogoValue({ pdf, logo: row.logo, x: valueX, y: textY });
    } else {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.text(row.value, valueX, textY);
    }

    drawCheckbox(pdf, checkboxX, rowTop + 1.5);
  });

  return height;
}

async function drawSummaryPage({
  pdf,
  logoDataUrl,
  orderDate,
  shipDate,
  orderNumber,
  spec,
  kimonoLogos,
  pantLogos,
}: {
  pdf: jsPDF;
  logoDataUrl: string;
  orderDate: Date;
  shipDate: Date;
  orderNumber: string;
  spec: GiSerializedState;
  kimonoLogos?: Partial<Record<KimonoLogoSlot, KimonoLogo>>;
  pantLogos?: Partial<Record<PantLogoSlot, KimonoLogo>>;
}) {
  pdf.addPage('letter', 'portrait');
  await drawHeader({ pdf, logoDataUrl, orderDate, shipDate, orderNumber });

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text('QC', 581, 79, { align: 'right' });

  const beltRows: SummaryRow[] = [
    {
      label: 'Belt Color:',
      kind: 'color',
      colorHex: spec.belt.color.hex,
      value: valueText(spec.belt.color.name),
    },
  ];
  const leftBeltText = spec.belt.embroidery.leftEnd.trim();
  if (leftBeltText) {
    beltRows.push(
      {
        label: 'Left Belt End Text:',
        kind: 'text',
        value: leftBeltText.toUpperCase(),
      },
      {
        label: 'Left Belt End Font:',
        kind: 'text',
        value: spec.belt.embroidery.leftFont.toUpperCase(),
      },
      {
        label: 'Left Belt End Color:',
        kind: 'color',
        colorHex: spec.belt.embroidery.leftThreadColor,
        value: valueText(spec.belt.embroidery.leftThreadColorName),
      },
    );
  } else {
    beltRows.push({
      label: 'Left Belt End Text:',
      kind: 'text',
      value: 'NO',
    });
  }

  const rightBeltText = spec.belt.embroidery.rightEnd.trim();
  if (rightBeltText) {
    beltRows.push(
      {
        label: 'Right Belt End Text:',
        kind: 'text',
        value: rightBeltText.toUpperCase(),
      },
      {
        label: 'Right Belt End Font:',
        kind: 'text',
        value: spec.belt.embroidery.rightFont.toUpperCase(),
      },
      {
        label: 'Right Belt End Color:',
        kind: 'color',
        colorHex: spec.belt.embroidery.rightThreadColor,
        value: valueText(spec.belt.embroidery.rightThreadColorName),
      },
    );
  } else {
    beltRows.push({
      label: 'Right Belt End Text:',
      kind: 'text',
      value: 'NO',
    });
  }

  const SECTION_GAP = 36;
  let sectionY = 86;

  sectionY += drawSummarySection({
    pdf,
    title: 'KIMONO',
    size: spec.kimono.size,
    y: sectionY,
    notOrdered: !spec.partVisibility.jacket,
    rows: [
      {
        label: 'Kimono Body Color:',
        kind: 'color',
        colorHex: spec.kimono.colors.body.hex,
        value: valueText(spec.kimono.colors.body.name),
      },
      {
        label: 'Kimono Lapel Color:',
        kind: 'color',
        colorHex: spec.kimono.colors.lapel.hex,
        value: valueText(spec.kimono.colors.lapel.name),
      },
      {
        label: 'Kimono Reinforcements Color:',
        kind: 'color',
        colorHex: spec.kimono.colors.reinforcement.hex,
        value: valueText(spec.kimono.colors.reinforcement.name),
      },
      {
        label: 'Kimono Stitching Color:',
        kind: 'color',
        colorHex: spec.kimono.colors.stitching.hex,
        value: valueText(spec.kimono.colors.stitching.name),
      },
      {
        label: 'Left Chest Logo:',
        kind: 'logo',
        logo: logoForSlot(kimonoLogos, 'left-chest'),
      },
      {
        label: 'Left Sleeve Logo:',
        kind: 'logo',
        logo: logoForSlot(kimonoLogos, 'left-sleeve'),
      },
      {
        label: 'Right Sleeve Logo:',
        kind: 'logo',
        logo: logoForSlot(kimonoLogos, 'right-sleeve'),
      },
      {
        label: 'Big Back Logo:',
        kind: 'logo',
        logo: logoForSlot(kimonoLogos, 'back'),
      },
    ],
  });

  sectionY += SECTION_GAP;
  sectionY += drawSummarySection({
    pdf,
    title: 'BELT',
    size: spec.belt.size,
    y: sectionY,
    notOrdered: !spec.partVisibility.belt,
    rows: beltRows,
  });

  drawSummarySection({
    pdf,
    title: 'PANT',
    size: spec.pant.size,
    y: sectionY + SECTION_GAP,
    notOrdered: !spec.partVisibility.pants,
    rows: [
      {
        label: 'Pant Body Color:',
        kind: 'color',
        colorHex: spec.pant.colors.body.hex,
        value: valueText(spec.pant.colors.body.name),
      },
      {
        label: 'Pant Reinforcements Color:',
        kind: 'color',
        colorHex: spec.pant.colors.reinforcement.hex,
        value: valueText(spec.pant.colors.reinforcement.name),
      },
      {
        label: 'Pant Stitching Color:',
        kind: 'color',
        colorHex: spec.pant.colors.stitching.hex,
        value: valueText(spec.pant.colors.stitching.name),
      },
      {
        label: 'Pant Drawcord Color:',
        kind: 'color',
        colorHex: spec.pant.colors.drawcord.hex,
        value: valueText(spec.pant.colors.drawcord.name),
      },
      {
        label: 'Left Thigh Logo:',
        kind: 'logo',
        logo: logoForSlot(pantLogos, 'left-pant'),
      },
      {
        label: 'Right Thigh Logo:',
        kind: 'logo',
        logo: logoForSlot(pantLogos, 'right-pant'),
      },
    ],
  });
}

function drawPomMeasurementSection({
  pdf,
  title,
  size,
  rows,
  pomLetters,
  diagram,
  y,
}: {
  pdf: jsPDF;
  title: string;
  size: string;
  rows: SizeMeasurement[] | undefined;
  pomLetters: string[];
  diagram: TechPackImage;
  y: number;
}) {
  const x = 18;
  const width = 576;
  const tableWidth = 330;
  const diagramX = x + tableWidth;
  const diagramWidth = width - tableWidth;
  const headerHeight = 38;
  const rowHeight = 32;
  const bodyRows = rows?.length ? rows : [{ label: 'Measurements', value: 'SIZE NOT FOUND' }];
  const visibleRowCount = Math.max(6, bodyRows.length);
  const height = headerHeight + visibleRowCount * rowHeight;
  const pomWidth = 58;
  const labelWidth = 144;
  const valueWidth = 82;
  const qcWidth = tableWidth - pomWidth - labelWidth - valueWidth;
  const labelX = x + pomWidth;
  const valueX = labelX + labelWidth;
  const qcX = valueX + valueWidth;

  pdf.setDrawColor(30);
  pdf.setLineWidth(0.65);
  pdf.rect(x, y, width, height);

  pdf.setFillColor(240, 240, 240);
  pdf.rect(x, y, tableWidth, headerHeight, 'F');
  pdf.setDrawColor(30);
  pdf.setLineWidth(0.9);
  pdf.rect(x, y, tableWidth, headerHeight);
  pdf.line(x, y + headerHeight, x + width, y + headerHeight);
  pdf.setLineWidth(0.65);
  pdf.line(diagramX, y, diagramX, y + height);
  pdf.line(labelX, y, labelX, y + height);
  pdf.line(valueX, y, valueX, y + height);
  pdf.line(qcX, y, qcX, y + height);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.setTextColor(35);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(14);
  pdf.text('POM', x + pomWidth / 2, y + 25, { align: 'center' });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text(title, labelX + 10, y + 25);
  pdf.setFontSize(15);
  pdf.text(size, valueX + valueWidth / 2, y + 25, { align: 'center' });
  pdf.setFontSize(14);
  pdf.text('QC', qcX + qcWidth / 2, y + 25, { align: 'center' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(14);
  pdf.setTextColor(60);
  pdf.text(
    'POINT OF MEASUREMENT',
    diagramX + diagramWidth / 2,
    y + 25,
    { align: 'center' },
  );

  addImageFit(pdf, diagram, {
    x: diagramX + 8,
    y: y + headerHeight + 8,
    width: diagramWidth - 16,
    height: height - headerHeight - 16,
  });

  for (let index = 0; index < visibleRowCount; index += 1) {
    const row = bodyRows[index];
    const rowTop = y + headerHeight + index * rowHeight;
    const textY = rowTop + 20.5;
    if (index > 0) {
      pdf.setLineWidth(0.35);
      pdf.line(x, rowTop, diagramX, rowTop);
    }

    if (!row) continue;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(45);
    pdf.text(pomLetters[index] ?? '', x + pomWidth / 2, textY, {
      align: 'center',
    });
    pdf.text(row.label.toUpperCase(), labelX + 10, textY);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text(row.value, valueX + valueWidth / 2, textY, { align: 'center' });

    drawCheckbox(pdf, qcX + (qcWidth - 20) / 2, rowTop + 5);
  }
}

async function drawSizeMeasurementsPage({
  pdf,
  logoDataUrl,
  orderDate,
  shipDate,
  orderNumber,
  spec,
}: {
  pdf: jsPDF;
  logoDataUrl: string;
  orderDate: Date;
  shipDate: Date;
  orderNumber: string;
  spec: GiSerializedState;
}) {
  pdf.addPage('letter', 'portrait');
  const [kimonoPom, pantPom] = await Promise.all([
    loadTechPackImage(KIMONO_POM_URL),
    loadTechPackImage(PANT_POM_URL),
  ]);

  await drawHeader({ pdf, logoDataUrl, orderDate, shipDate, orderNumber });

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(35);
  pdf.text('SIZE MEASUREMENTS', 306, 104, { align: 'center' });

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.setTextColor(85);
  pdf.text('Strict measurements for the selected kimono and pant sizes.', 306, 124, {
    align: 'center',
  });
  pdf.text('All measurements in centimeters', 306, 139, { align: 'center' });

  pdf.setDrawColor(70);
  pdf.setLineWidth(0.45);
  pdf.line(18, 158, 594, 158);

  drawPomMeasurementSection({
    pdf,
    title: 'KIMONO',
    size: spec.kimono.size,
    rows: KIMONO_SIZE_MEASUREMENTS[spec.kimono.size],
    pomLetters: ['a', 'b', 'c', 'd', 'e'],
    diagram: kimonoPom,
    y: 178,
  });

  drawPomMeasurementSection({
    pdf,
    title: 'PANT',
    size: spec.pant.size,
    rows: PANT_SIZE_MEASUREMENTS[spec.pant.size],
    pomLetters: ['f', 'g', 'h', 'i'],
    diagram: pantPom,
    y: 508,
  });
}

async function drawBrandingPage({
  pdf,
  logoDataUrl,
  orderDate,
  shipDate,
  orderNumber,
}: {
  pdf: jsPDF;
  logoDataUrl: string;
  orderDate: Date;
  shipDate: Date;
  orderNumber: string;
}) {
  const brandingPage = await loadSvgTechPackPage(BRANDING_URL);
  pdf.addPage('letter', 'portrait');
  await drawHeader({ pdf, logoDataUrl, orderDate, shipDate, orderNumber });
  addImageFit(pdf, brandingPage, {
    x: 4,
    y: 64,
    width: pdf.internal.pageSize.getWidth() - 8,
    height: pdf.internal.pageSize.getHeight() - 68,
  });
}

type LogoPlacementPage = {
  logo: KimonoLogo;
  placement: string;
  maxMeasurementIn: number;
  viewImage: TechPackImage;
  viewCrop: CropRegion;
};

function logoMeasurementAxis(logo: KimonoLogo) {
  if (logo.imageWidth > logo.imageHeight) return 'width';
  if (logo.imageHeight > logo.imageWidth) return 'height';
  return 'square';
}

function logoPlacementMeasurementText(logo: KimonoLogo, maxMeasurementIn: number) {
  const axis = logoMeasurementAxis(logo);
  if (axis === 'width') return `${fmtInches(maxMeasurementIn)}" WIDE`;
  if (axis === 'height') return `${fmtInches(maxMeasurementIn)}" IN HEIGHT`;
  return `${fmtInches(maxMeasurementIn)}" W x ${fmtInches(maxMeasurementIn)}" H`;
}

function cleanPlacementLabel(label: string) {
  return label
    .replace(/^Logo on\s+/i, '')
    .replace(/^Big Logo on\s+/i, 'Big ')
    .toUpperCase();
}

function logoPlacementPages({
  kimonoLogos,
  pantLogos,
  frontImage,
  backImage,
  leftImage,
  rightImage,
  kidsProportions = false,
}: {
  kimonoLogos?: Partial<Record<KimonoLogoSlot, KimonoLogo>>;
  pantLogos?: Partial<Record<PantLogoSlot, KimonoLogo>>;
  frontImage: TechPackImage;
  backImage: TechPackImage;
  leftImage?: TechPackImage | null;
  rightImage?: TechPackImage | null;
  /** Kids model has shorter legs — the thighs sit higher in the front view. */
  kidsProportions?: boolean;
}) {
  const pages: LogoPlacementPage[] = [];

  (Object.entries(kimonoLogos ?? {}) as [KimonoLogoSlot, KimonoLogo][]).forEach(
    ([slot, logo]) => {
      if (!logo) return;
      const anchor = KIMONO_LOGO_ANCHORS[slot];
      pages.push({
        logo,
        placement: cleanPlacementLabel(KIMONO_LOGO_SLOT_LABEL[slot]),
        maxMeasurementIn: slot === 'back' ? 10 : 4,
        viewImage:
          slot === 'back'
            ? backImage
            : slot === 'left-sleeve'
              ? rightImage ?? frontImage
              : slot === 'right-sleeve'
                ? leftImage ?? frontImage
                : frontImage,
        viewCrop:
          slot === 'back'
            ? { x: 0.08, y: 0, width: 0.84, height: 0.55 }
            : slot === 'left-sleeve' || slot === 'right-sleeve'
              ? { x: 0, y: 0, width: 1, height: 0.62 }
              : { x: 0.03, y: 0, width: 0.94, height: 0.55 },
      });
    },
  );

  (Object.entries(pantLogos ?? {}) as [PantLogoSlot, KimonoLogo][]).forEach(
    ([slot, logo]) => {
      if (!logo) return;
      const anchor = PANT_LOGO_ANCHORS[slot];
      pages.push({
        logo,
        placement: cleanPlacementLabel(PANT_LOGO_SLOT_LABEL[slot]).replace(
          'THIGH',
          'THIGH',
        ),
        maxMeasurementIn: 4,
        viewImage: frontImage,
        // Thigh band, as a fraction of the front view. Measured: the adult
        // thigh centers ~67% down the garment, the kids thigh ~59% (shorter
        // legs) — so the kids crop shifts up to keep the thigh centered.
        viewCrop: kidsProportions
          ? { x: 0, y: 0.36, width: 1, height: 0.46 }
          : { x: 0, y: 0.42, width: 1, height: 0.46 },
      });
    },
  );

  return pages;
}

async function drawLogoPlacementPage({
  pdf,
  logoDataUrl,
  orderDate,
  shipDate,
  orderNumber,
  page,
}: {
  pdf: jsPDF;
  logoDataUrl: string;
  orderDate: Date;
  shipDate: Date;
  orderNumber: string;
  page: LogoPlacementPage;
}) {
  pdf.addPage('letter', 'portrait');
  await drawHeader({ pdf, logoDataUrl, orderDate, shipDate, orderNumber });

  const topBox = { x: 13, y: 74, width: 586, height: 390 };
  const bottomBox = { x: 13, y: 484, width: 586, height: 290 };

  pdf.setDrawColor(55);
  pdf.setLineWidth(0.55);
  pdf.rect(topBox.x, topBox.y, topBox.width, topBox.height);
  pdf.rect(bottomBox.x, bottomBox.y, bottomBox.width, bottomBox.height);

  const placementView = await cropTechPackImage(page.viewImage, page.viewCrop);
  addImageFit(pdf, placementView, {
    x: topBox.x + 6,
    y: topBox.y + 8,
    width: topBox.width - 12,
    height: topBox.height - 16,
  });

  const labelX = bottomBox.x + 16;
  const valueX = bottomBox.x + 142;
  const startY = bottomBox.y + 38;
  const rowGap = 26;
  const logo = logoImage(page.logo);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(35);
  pdf.text('METHOD:', labelX, startY);
  pdf.text('PLACEMENT:', labelX, startY + rowGap);
  pdf.text('MEASUREMENT:', labelX, startY + rowGap * 2);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('EMBROIDERY', valueX, startY);
  pdf.text(page.placement, valueX, startY + rowGap);
  pdf.text(
    logoPlacementMeasurementText(page.logo, page.maxMeasurementIn).toUpperCase(),
    valueX,
    startY + rowGap * 2,
  );

  const logoBox = {
    x: bottomBox.x + bottomBox.width * 0.35,
    y: bottomBox.y + 34,
    width: bottomBox.width * 0.65 - 70,
    height: 198,
  };
  addImageFit(pdf, logo, logoBox);

  const measurementAxis = logoMeasurementAxis(page.logo);
  if (measurementAxis === 'height' || measurementAxis === 'square') {
    const arrowX = bottomBox.x + bottomBox.width - 55;
    drawVerticalMeasurementArrow({
      pdf,
      x: arrowX,
      y1: logoBox.y + 5,
      y2: logoBox.y + logoBox.height - 5,
      label: `${fmtInches(page.maxMeasurementIn)}"`,
    });
  } else {
    drawMeasurementArrow({
      pdf,
      x1: logoBox.x,
      x2: logoBox.x + logoBox.width,
      y: bottomBox.y + 250,
      label: `${fmtInches(page.maxMeasurementIn)}"`,
    });
  }
}

type BeltTextPage = {
  side: 'LEFT BELT END' | 'RIGHT BELT END';
  text: string;
  fontName: string;
  threadColor: string;
  threadColorName: string | null;
  viewImage: TechPackImage;
};

function beltTextPages({
  spec,
  frontImage,
  leftBeltImage,
  rightBeltImage,
}: {
  spec: GiSerializedState;
  frontImage: TechPackImage;
  leftBeltImage?: TechPackImage | null;
  rightBeltImage?: TechPackImage | null;
}) {
  const pages: BeltTextPage[] = [];
  const leftText = spec.belt.embroidery.leftEnd.trim();
  const rightText = spec.belt.embroidery.rightEnd.trim();

  if (leftText) {
    pages.push({
      side: 'LEFT BELT END',
      text: leftText,
      fontName: spec.belt.embroidery.leftFont,
      threadColor: spec.belt.embroidery.leftThreadColor,
      threadColorName: spec.belt.embroidery.leftThreadColorName,
      viewImage: leftBeltImage ?? frontImage,
    });
  }

  if (rightText) {
    pages.push({
      side: 'RIGHT BELT END',
      text: rightText,
      fontName: spec.belt.embroidery.rightFont,
      threadColor: spec.belt.embroidery.rightThreadColor,
      threadColorName: spec.belt.embroidery.rightThreadColorName,
      viewImage: rightBeltImage ?? frontImage,
    });
  }

  return pages;
}

async function drawBeltTextPage({
  pdf,
  logoDataUrl,
  orderDate,
  shipDate,
  orderNumber,
  page,
}: {
  pdf: jsPDF;
  logoDataUrl: string;
  orderDate: Date;
  shipDate: Date;
  orderNumber: string;
  page: BeltTextPage;
}) {
  pdf.addPage('letter', 'portrait');
  await drawHeader({ pdf, logoDataUrl, orderDate, shipDate, orderNumber });

  const topBox = { x: 13, y: 74, width: 586, height: 390 };
  const bottomBox = { x: 13, y: 484, width: 586, height: 290 };

  pdf.setDrawColor(55);
  pdf.setLineWidth(0.55);
  pdf.rect(topBox.x, topBox.y, topBox.width, topBox.height);
  pdf.rect(bottomBox.x, bottomBox.y, bottomBox.width, bottomBox.height);

  const beltView = await cropTechPackImage(page.viewImage, {
    x: 0.02,
    y: 0.2,
    width: 0.96,
    height: 0.48,
  });
  addImageFit(pdf, beltView, {
    x: topBox.x + 6,
    y: topBox.y + 8,
    width: topBox.width - 12,
    height: topBox.height - 16,
  });

  const labelX = bottomBox.x + 16;
  const valueX = bottomBox.x + 145;
  const startY = bottomBox.y + 43;
  const rowGap = 27;

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(35);
  pdf.text('METHOD:', labelX, startY);
  pdf.text('PLACEMENT:', labelX, startY + rowGap);
  pdf.text('TEXT:', labelX, startY + rowGap * 2);
  pdf.text('FONT:', labelX, startY + rowGap * 3);
  pdf.text('THREAD COLOR:', labelX, startY + rowGap * 4);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(35);
  pdf.text('EMBROIDERY', valueX, startY);
  pdf.text(page.side, valueX, startY + rowGap);
  pdf.text(page.text.trim().toUpperCase(), valueX, startY + rowGap * 2);
  pdf.text(page.fontName.toUpperCase(), valueX, startY + rowGap * 3);
  drawColorChip(pdf, page.threadColor, valueX, startY + rowGap * 4 - 2);
  pdf.text(valueText(page.threadColorName), valueX + 34, startY + rowGap * 4);

  const artwork = renderBeltTextArtwork({
    text: page.text,
    color: page.threadColor,
    fontName: page.fontName,
  });
  const artworkBox = {
    x: bottomBox.x + 245,
    y: bottomBox.y + 100,
    width: 305,
    height: 78,
  };
  addImageFit(pdf, artwork, artworkBox);
}

async function drawHeader({
  pdf,
  logoDataUrl,
  orderDate,
  shipDate,
  orderNumber,
}: {
  pdf: jsPDF;
  logoDataUrl: string;
  orderDate: Date;
  shipDate: Date;
  orderNumber: string;
}) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const marginX = 27;
  const headerWidth = pageWidth - marginX * 2;
  const headerHeight = 34;
  const headerDataUrl = await renderHeaderDataUrl({
    logoDataUrl,
    orderDate,
    shipDate,
    orderNumber,
  });

  pdf.addImage(headerDataUrl, 'PNG', marginX, 27, headerWidth, headerHeight);
}

export async function generateGiTechPackPageOne({
  spec,
  frontDataUrl,
  backDataUrl,
  leftSideDataUrl,
  rightSideDataUrl,
  leftBeltEndDataUrl,
  rightBeltEndDataUrl,
  kimonoLogos: kimonoLogosInput,
  pantLogos: pantLogosInput,
  orderDate = new Date(),
  orderNumber = buildOrderNumber(orderDate),
  productName = 'gi',
  includeSizeMeasurements = true,
  kidsProportions = false,
}: GenerateGiTechPackInput) {
  // PDF diet: right-size every logo to its placement's print ceiling before
  // any page embeds it. The back logo prints up to 10in (3000px at 300 DPI);
  // chest/sleeve/thigh placements print at 4in (1200px). jsPDF de-duplicates
  // identical images across pages, so each logo is embedded once, at print
  // resolution, instead of at raw upload weight on every page.
  const [kimonoLogos, pantLogos] = await Promise.all([
    resampleLogosForPrint(kimonoLogosInput, (slot) =>
      slot === 'back' ? 3000 : 1200,
    ),
    resampleLogosForPrint(pantLogosInput, () => 1200),
  ]);

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  });
  const [
    logoDataUrl,
    frontImage,
    backImage,
    leftImage,
    rightImage,
    leftBeltImage,
    rightBeltImage,
  ] = await Promise.all([
    loadImageDataUrl(LOGO_URL),
    cropToVisibleSubject(frontDataUrl),
    cropToVisibleSubject(backDataUrl),
    leftSideDataUrl ? cropToVisibleSubject(leftSideDataUrl) : null,
    rightSideDataUrl ? cropToVisibleSubject(rightSideDataUrl) : null,
    leftBeltEndDataUrl ? cropToVisibleSubject(leftBeltEndDataUrl) : null,
    rightBeltEndDataUrl ? cropToVisibleSubject(rightBeltEndDataUrl) : null,
  ]);
  const shipDate = new Date(orderDate);
  shipDate.setDate(shipDate.getDate() + 7);

  await drawHeader({
    pdf,
    logoDataUrl,
    orderDate,
    shipDate,
    orderNumber,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 22;
  const topY = 91;
  const bottomMargin = 34;
  const gutter = 12;
  const imageWidth = (pageWidth - marginX * 2 - gutter) / 2;
  const imageHeight = pageHeight - topY - bottomMargin;

  try {
    addImageFit(pdf, frontImage, {
      x: marginX,
      y: topY,
      width: imageWidth,
      height: imageHeight,
    });
  } catch {
    // Keep the export alive so future pages can still be generated.
  }

  try {
    addImageFit(pdf, backImage, {
      x: marginX + imageWidth + gutter,
      y: topY,
      width: imageWidth,
      height: imageHeight,
    });
  } catch {
    // Keep the export alive so future pages can still be generated.
  }

  if (leftImage && rightImage) {
    pdf.addPage('letter', 'portrait');
    await drawHeader({
      pdf,
      logoDataUrl,
      orderDate,
      shipDate,
      orderNumber,
    });

    try {
      addImageFit(pdf, leftImage, {
        x: marginX,
        y: topY,
        width: imageWidth,
        height: imageHeight,
      });
    } catch {
      // Keep the export alive.
    }

    try {
      addImageFit(pdf, rightImage, {
        x: marginX + imageWidth + gutter,
        y: topY,
        width: imageWidth,
        height: imageHeight,
      });
    } catch {
      // Keep the export alive.
    }
  }

  await drawSummaryPage({
    pdf,
    logoDataUrl,
    orderDate,
    shipDate,
    orderNumber,
    spec,
    kimonoLogos,
    pantLogos,
  });

  if (includeSizeMeasurements) {
    await drawSizeMeasurementsPage({
      pdf,
      logoDataUrl,
      orderDate,
      shipDate,
      orderNumber,
      spec,
    });
  }

  await drawBrandingPage({
    pdf,
    logoDataUrl,
    orderDate,
    shipDate,
    orderNumber,
  });

  const placementPages = logoPlacementPages({
    kimonoLogos,
    pantLogos,
    frontImage,
    backImage,
    leftImage,
    rightImage,
    kidsProportions,
  });

  for (const page of placementPages) {
    await drawLogoPlacementPage({
      pdf,
      logoDataUrl,
      orderDate,
      shipDate,
      orderNumber,
      page,
    });
  }

  for (const page of beltTextPages({
    spec,
    frontImage,
    leftBeltImage,
    rightBeltImage,
  })) {
    await drawBeltTextPage({
      pdf,
      logoDataUrl,
      orderDate,
      shipDate,
      orderNumber,
      page,
    });
  }

  // Filename: <order_number>_<product_name>.pdf (e.g. 1042_mens-gi.pdf).
  const fileName = `${fileNameSlug(orderNumber, 'order')}_${fileNameSlug(
    productName,
    'gi',
  )}.pdf`;
  pdf.save(fileName);
  // Hand the exact bytes back so the caller can freeze them in the versioned
  // tech-pack store — the download and the archived version must be identical.
  return { blob: pdf.output('blob') as Blob, fileName };
}
