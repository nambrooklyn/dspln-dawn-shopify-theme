/**
 * Owner-only "studio" mode.
 *
 * The save / saved-designs / uploads UI is hidden from customers until the
 * full account experience ships, but the store owner still needs it to
 * create designs and copy share links. Opening the configurator with
 * ?studio=1 (the theme forwards the param into the iframe) enables the
 * hidden UI for the rest of the browser session.
 *
 * It is an unlisted door, not authentication — anyone who knows the exact
 * URL could open it, so it must never unlock pricing or admin data.
 */
const STORAGE_KEY = 'dspln:studio-mode';

export function isStudioMode(): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('studio');
    if (flag === '1') {
      window.sessionStorage.setItem(STORAGE_KEY, '1');
      return true;
    }
    if (flag === '0') {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return false;
    }
    return window.sessionStorage.getItem(STORAGE_KEY) === '1';
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
