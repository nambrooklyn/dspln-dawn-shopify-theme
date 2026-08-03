/**
 * Storefront link helpers.
 *
 * The configurator is embedded in an <iframe> on a Shopify storefront —
 * production (dspln.com), a mirror dev store (*.myshopify.com), or a local
 * preview harness. Links that leave the app (login, logout, account, guide,
 * sizing, product deep links) must target the storefront the visitor is
 * actually on, never a hardcoded domain, or login/account round-trips break
 * on any non-production store.
 */

const PRODUCTION_STOREFRONT_ORIGIN = 'https://dspln.com';

export function storefrontOrigin(): string {
  if (typeof window === 'undefined') return PRODUCTION_STOREFRONT_ORIGIN;

  // Embedded case: the parent storefront page is the referrer. Shopify's
  // default referrer policy still exposes the origin cross-origin, which is
  // all we need.
  if (document.referrer) {
    try {
      const referrer = new URL(document.referrer);
      if (
        (referrer.protocol === 'https:' || referrer.protocol === 'http:') &&
        referrer.origin !== window.location.origin
      ) {
        return referrer.origin;
      }
    } catch {
      // Unparseable referrer — fall through to the shop param.
    }
  }

  // Standalone case (opened directly, or referrer stripped): the embed also
  // passes the shop domain as a query param.
  const shop = new URLSearchParams(window.location.search).get('shop')?.trim();
  if (shop) {
    const host = shop.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (host) return `https://${host}`;
  }

  return PRODUCTION_STOREFRONT_ORIGIN;
}

export function storefrontUrl(path: string): string {
  return new URL(path, storefrontOrigin()).toString();
}

export function openStorefrontPage(path: string) {
  if (typeof window === 'undefined') return;
  window.open(storefrontUrl(path), '_top');
}
