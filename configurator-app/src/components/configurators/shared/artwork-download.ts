/**
 * Download an uploaded artwork file back to the user's device.
 *
 * DSPLN admin often has to correct a customer's uploaded logo: pull the
 * original file down, fix it, and re-upload it. Artwork URLs are either
 * data: URLs (legacy fallback) or Shopify-hosted files, so a plain
 * <a download> is not reliable cross-origin — fetch to a blob and save
 * that instead. If the fetch is blocked, fall back to opening the file in
 * a new tab where it can be saved manually.
 */
export async function downloadArtworkFile(url: string, filename?: string) {
  const safeName = (filename || 'artwork.png').replace(/[/\\]/g, '_');
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error(String(response.status));
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = safeName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
    return true;
  } catch {
    window.open(url, '_blank', 'noopener');
    return false;
  }
}
