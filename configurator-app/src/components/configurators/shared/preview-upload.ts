interface PreviewUploadResponse {
  url?: unknown;
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

      const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
      const cropX = Math.max(0, Math.round((image.naturalWidth - cropSize) / 2));
      const cropY = Math.max(0, Math.round((image.naturalHeight - cropSize) / 2));

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, outputSize, outputSize);
      context.drawImage(
        image,
        cropX,
        cropY,
        cropSize,
        cropSize,
        0,
        0,
        outputSize,
        outputSize,
      );

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
