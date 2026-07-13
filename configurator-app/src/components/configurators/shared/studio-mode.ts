/**
 * Owner-only "studio" mode.
 *
 * The save / saved-designs / uploads UI is hidden from customers until the
 * full account experience ships, but the store owner still needs it to
 * create designs and copy share links. Opening the configurator with
 * ?studio=1 (the theme forwards the param into the iframe) enables the
 * hidden UI for the rest of the browser session.
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
