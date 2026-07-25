/**
 * Shared rail links used by BOTH the configurator action rails and The
 * Locker's rail, so a link added here shows up on every page that renders
 * the left rail. Defined once; imported everywhere.
 */
import { memo } from 'react';

function LockerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden="true"
    >
      <rect x="6" y="2.5" width="12" height="17" rx="1.4" />
      <line x1="9.2" y1="6" x2="14.8" y2="6" />
      <line x1="9.2" y1="8" x2="14.8" y2="8" />
      <line x1="9.2" y1="10" x2="14.8" y2="10" />
      <rect x="13.9" y="12.3" width="1.5" height="4" rx="0.75" />
      <path d="M8.4 19.5 8 22M15.6 19.5 16 22" />
    </svg>
  );
}

/** The customer-facing Locker lives on the Shopify storefront. */
export function lockerUrl(): string {
  if (typeof window === 'undefined') return '/pages/locker';
  try {
    const referrer = document.referrer ? new URL(document.referrer) : null;
    if (referrer && referrer.origin !== window.location.origin) {
      return new URL('/pages/locker', referrer.origin).toString();
    }
  } catch {
    // Fall back to the store encoded in the configurator query.
  }
  const shop = new URLSearchParams(window.location.search).get('shop');
  const isDevDeploy = window.location.hostname.startsWith('dev--');
  return shop
    ? `https://${shop.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}/pages/locker`
    : isDevDeploy
      ? 'https://dspln-dev-2.myshopify.com/pages/locker'
    : 'https://dspln.com/pages/locker';
}

/** Navigate the TOP window (break out of the storefront iframe) to the Locker. */
export function openLocker() {
  if (typeof window === 'undefined') return;
  const url = lockerUrl();
  try {
    if (window.top) window.top.location.href = url;
    else window.location.href = url;
  } catch {
    window.location.href = url;
  }
}

export const LockerRailButton = memo(({ className }: { className: string }) => (
  <button type="button" className={className} onClick={openLocker} title="The Locker">
    <LockerIcon />
    <span className="text-[11px] font-medium leading-none">Locker</span>
  </button>
));
