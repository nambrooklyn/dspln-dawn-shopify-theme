/**
 * Live-site build: studio tooling moved into the factory portal
 * (portal.dspln.com/studio), which hosts its own copy of these
 * configurators with studio mode always on. The ?studio=1 door is gone.
 *
 * The one exception is admin order-edit (?edit=admin, opened from the
 * portal): correcting a customer's order needs the save toolset here,
 * because the order's design loads on the live product page.
 */
export function isStudioMode(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    return new URLSearchParams(window.location.search).get('edit') === 'admin';
  } catch {
    return false;
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // The async clipboard API can be blocked inside the Shopify iframe;
    // fall back to the legacy hidden-textarea copy.
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      el.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
