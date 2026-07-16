interface PreviewUploadResponse {
  url?: unknown;
}

/**
 * The upload-artwork function rejects logos over ~6MB, and when an upload
 * fails the app embeds the base64 into the design-save request, which then
 * exceeds Netlify's ~6MB body limit and blocks add-to-cart. Downscale
 * oversized logos so uploads succeed and the save never balloons. PNG output
 * preserves transparency; only the pixel dimensions are reduced.
 */
// Cap the BINARY size so the base64-encoded upload body (~1.37x binary)
// stays far under Netlify's ~6MB function limit even with request overhead.
// The previous 5.2MB cap produced ~6.9MB bodies — uploads still failed and
// the fallback embedded the same base64 into the design save, failing that
// too. 2.5MB binary ≈ 3.4MB body: comfortable headroom.
const ARTWORK_MAX_BYTES = 2_500_000;

// Print ceiling: the largest placement is the 10-inch back logo, which at
// print-grade 300 DPI needs 3000px. Pixels beyond that are physically
// unprintable, so resizing to this bound loses nothing visible.
const ARTWORK_MAX_DIMENSION_PX = 3000;

function estimateDataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.floor((base64.length * 3) / 4);
}

/** Sampled alpha check — opaque images can use JPEG (~10-50x smaller). */
function hasTransparency(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): boolean {
  try {
    const data = context.getImageData(0, 0, width, height).data;
    // Stride through alpha bytes; sampling every 64th pixel is plenty to
    // detect real transparency while staying fast on large images.
    for (let i = 3; i < data.length; i += 4 * 64) {
      if (data[i] < 250) return true;
    }
    return false;
  } catch {
    return true; // be safe: keep PNG if we can't inspect
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

export async function shrinkArtworkDataUrl(
  imageDataUrl: string,
  maxBytes = ARTWORK_MAX_BYTES,
): Promise<string> {
  if (typeof document === 'undefined') return imageDataUrl;
  if (!imageDataUrl.startsWith('data:image/')) return imageDataUrl;

  const image = await loadImageElement(imageDataUrl);
  if (!image || !image.naturalWidth || !image.naturalHeight) return imageDataUrl;

  const overDimension =
    Math.max(image.naturalWidth, image.naturalHeight) >
    ARTWORK_MAX_DIMENSION_PX;
  if (estimateDataUrlBytes(imageDataUrl) <= maxBytes && !overDimension) {
    return imageDataUrl;
  }

  // First pass: clamp to the print ceiling. Then, if the re-encode is still
  // over budget, step the dimensions down (bytes scale ~ with pixel count),
  // with a floor so a logo never shrinks into uselessness. Opaque images
  // re-encode as JPEG (massively smaller for photos/screenshots); anything
  // with transparency stays PNG to preserve the alpha channel.
  let scale = Math.min(
    1,
    ARTWORK_MAX_DIMENSION_PX /
      Math.max(image.naturalWidth, image.naturalHeight),
  );

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return imageDataUrl;
    context.clearRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    const output = hasTransparency(context, width, height)
      ? canvas.toDataURL('image/png')
      : canvas.toDataURL('image/jpeg', 0.92);
    if (
      estimateDataUrlBytes(output) <= maxBytes ||
      Math.max(width, height) <= 512
    ) {
      return output;
    }
    scale *= 0.8;
  }
  return imageDataUrl;
}

async function compressPreviewImage(
  imageDataUrl: string,
  outputSize: number,
  quality: number,
): Promise<string | null> {
  if (typeof window === 'undefined') return null;

  return new Promise((resolve) => {
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = outputSize;
      canvas.height = outputSize;

      const context = canvas.getContext('2d');
      if (!context) {
        resolve(null);
        return;
      }

      // Fit the whole image into the square (white padding) instead of
      // center-cropping — portrait captures from mobile would otherwise
      // lose the top/bottom of the model.
      const scale =
        outputSize / Math.max(image.naturalWidth, image.naturalHeight);
      const drawWidth = Math.round(image.naturalWidth * scale);
      const drawHeight = Math.round(image.naturalHeight * scale);
      const drawX = Math.round((outputSize - drawWidth) / 2);
      const drawY = Math.round((outputSize - drawHeight) / 2);

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, outputSize, outputSize);
      context.drawImage(image, drawX, drawY, drawWidth, drawHeight);

      resolve(canvas.toDataURL('image/jpeg', quality));
    };

    image.onerror = () => resolve(null);
    image.src = imageDataUrl;
  });
}

async function uploadPreviewCandidate(imageDataUrl: string): Promise<string | null> {
  const response = await fetch('/.netlify/functions/upload-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageDataUrl }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as PreviewUploadResponse;
  return typeof data.url === 'string' ? data.url : null;
}

/**
 * Upload a full-resolution logo / artwork image and return its hosted URL.
 * Unlike uploadPreviewImage this does NOT crop or re-encode — logos must keep
 * their transparency and aspect ratio. Used so logo bytes stay out of the
 * design-record JSON (see gi-cloud-designs.imagesToCloudImages).
 */
export async function uploadArtworkImage(
  imageDataUrl: string,
): Promise<string | null> {
  if (!imageDataUrl.startsWith('data:image/')) return null;

  try {
    const response = await fetch('/.netlify/functions/upload-artwork', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageDataUrl }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as PreviewUploadResponse;
    return typeof data.url === 'string' ? data.url : null;
  } catch {
    return null;
  }
}

export async function uploadPreviewImage(
  imageDataUrl: string,
): Promise<string | null> {
  if (!imageDataUrl.startsWith('data:image/')) return null;

  try {
    const uploaded = await uploadPreviewCandidate(imageDataUrl);
    if (uploaded) return uploaded;

    const retryOptions = [
      { outputSize: 640, quality: 0.78 },
      { outputSize: 520, quality: 0.72 },
      { outputSize: 420, quality: 0.68 },
    ];

    for (const option of retryOptions) {
      const compressed = await compressPreviewImage(
        imageDataUrl,
        option.outputSize,
        option.quality,
      );
      if (!compressed) continue;

      const retryUploaded = await uploadPreviewCandidate(compressed);
      if (retryUploaded) return retryUploaded;
    }

    return null;
  } catch {
    return null;
  }
}
