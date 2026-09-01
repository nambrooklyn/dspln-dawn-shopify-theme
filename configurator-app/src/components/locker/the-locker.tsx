/**
 * The Locker — DSPLN's customer dashboard.
 *
 * The customer-facing Locker is embedded by the Shopify storefront at
 * /pages/locker. Shopify owns authentication and passes the signed-in
 * customer identity to this app. The app then joins that identity to DSPLN's
 * saved designs, uploaded artwork, fit profile, and Shopify order history.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, House, ImagePlus, Receipt, Scissors, Truck, X } from 'lucide-react';
import { toast } from 'sonner';

import { ArtworkStudioPage } from '../artwork-studio/artwork-studio-page';
import { GI_PRODUCT_CONFIGS } from '../configurators/shared/gi-product-config';
import { uploadArtworkImage } from '../configurators/shared/preview-upload';

type LockerPage = 'design-tool' | 'designs' | 'uploads' | 'fit' | 'orders';

interface LockerSession {
  signedIn: boolean;
  user?: { id: string; email: string; name: string; emailVerified: boolean };
  ownerKey?: string;
  shopifyCustomerId?: string | null;
  shopDomain?: string;
  linked?: boolean;
}

interface LockerCustomer {
  customerId: string;
  email: string;
  firstName: string;
  lastName: string;
  shopDomain: string;
  storefrontOrigin: string;
  /** Set when the identity came from a DSPLN account rather than Shopify. */
  ownerKeyOverride?: string;
  dsplnAccount?: boolean;
}

interface LockerOrder {
  id: string;
  name: string;
  processedAt: string;
  financialStatus: string;
  fulfillmentStatus: string;
  totalAmount: string;
  totalCurrency: string;
  statusPageUrl: string;
  cancelledAt?: string;
  cancelReason?: string;
  /** Written by the factory portal; describes the pre-dispatch phase only. */
  productionStage?: {
    state?: 'being_made' | 'in_transit' | 'quality_check';
    actionNeeded?: boolean;
    actionMessage?: string | null;
    updatedAt?: string;
  } | null;
  fulfillments?: Array<{
    createdAt?: string;
    trackingCompany?: string;
    trackingNumber?: string;
    trackingUrl?: string;
  }>;
  items?: Array<{
    title: string;
    productTitle?: string;
    quantity: number;
    totalAmount: string;
    imageUrl?: string;
    properties?: Array<{ name: string; value: string }>;
  }>;
  billingAddress?: LockerAddress;
  shippingAddress?: LockerAddress;
}

interface OrderEvent {
  id: string;
  orderId: string;
  type: 'stage' | 'email' | 'production' | 'chat' | 'note' | 'order-edit' | 'file';
  visibility: 'customer' | 'internal';
  actor?: { kind?: string; name?: string | null };
  title: string;
  body?: string | null;
  payload?: Record<string, unknown> | null;
  createdAt: string;
}

interface LockerAddress {
  name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  country?: string;
}

interface LockerDesign {
  id: string;
  name?: string;
  productHandle?: string;
  thumbnailUrl?: string | null;
  updatedAt?: string;
}

interface LockerUpload {
  url: string;
  filename?: string;
  designId?: string;
  designName?: string;
  updatedAt?: string;
  part?: string;
  slot?: string;
  /**
   * Artwork saved straight from the Studio arrives alongside logos pulled out
   * of saved designs. The API merges both and hands back a dedupeKey so the
   * same image used in both places lands here once.
   */
  source?: 'artwork' | 'design';
  dedupeKey?: string;
  artworkId?: string;
  title?: string;
  revisionType?: 'upload' | 'cleanup' | 'manual-edit' | 'ai-edit';
}

const REVISION_LABEL: Record<string, string> = {
  upload: 'Uploaded artwork',
  cleanup: 'Background removed',
  'manual-edit': 'Edited in Studio',
  'ai-edit': 'AI revision',
};

/** Sub-line under an Uploads card: where the image came from. */
function uploadOrigin(upload: LockerUpload): string {
  if (upload.source === 'artwork') {
    return REVISION_LABEL[upload.revisionType ?? 'upload'] ?? 'Artwork Studio';
  }
  return upload.designName || 'Saved design';
}

interface FitProfile {
  units: 'imperial' | 'metric';
  height: string;
  weight: string;
  chest: string;
  waist: string;
  hips: string;
  inseam: string;
  shoulder: string;
  sleeve: string;
  preferredGiSize: string;
  fitPreference: 'slim' | 'regular' | 'relaxed';
  notes: string;
  updatedAt?: string;
}

const emptyFit: FitProfile = {
  units: 'imperial',
  height: '',
  weight: '',
  chest: '',
  waist: '',
  hips: '',
  inseam: '',
  shoulder: '',
  sleeve: '',
  preferredGiSize: '',
  fitPreference: 'regular',
  notes: '',
};

const label = 'text-[11px] uppercase tracking-[0.16em]';

function queryCustomer(): LockerCustomer | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const customerId = params.get('customerId')?.trim() ?? '';
  const email = params.get('customerEmail')?.trim() ?? '';
  const shopDomain = params.get('shop')?.trim() ?? '';
  if (!customerId || !shopDomain) return null;
  return {
    customerId,
    email,
    shopDomain,
    firstName: params.get('firstName')?.trim() ?? '',
    lastName: params.get('lastName')?.trim() ?? '',
    storefrontOrigin:
      params.get('storefrontOrigin')?.trim() ||
      (document.referrer ? new URL(document.referrer).origin : 'https://dspln.com'),
  };
}

function ownerKey(customer: LockerCustomer): string {
  // A DSPLN member linked to a past Shopify customer reads the very same
  // records; an unlinked one carries a dspln: key of their own.
  return customer.ownerKeyOverride ?? `shopify:${customer.shopDomain}:${customer.customerId}`;
}

function formatDate(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatMoney(amount: string, currency: string): string {
  const numeric = Number(amount);
  if (Number.isNaN(numeric)) return `${amount} ${currency}`.trim();
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
  }).format(numeric);
}

function AddressBlock({ address }: { address?: LockerAddress }) {
  if (!address) return <p className="text-sm text-[#777]">Not provided</p>;
  return (
    <address className="space-y-1 text-sm not-italic leading-relaxed text-[#444]">
      {address.name ? <div>{address.name}</div> : null}
      {address.address1 ? <div>{address.address1}</div> : null}
      {address.address2 ? <div>{address.address2}</div> : null}
      <div>{[address.city, address.province, address.zip].filter(Boolean).join(' ')}</div>
      {address.country ? <div>{address.country}</div> : null}
    </address>
  );
}

/**
 * Four customer-facing stages. Nine was an ops checklist: photos are content,
 * "review" is an action after delivery, and Brooklyn QC only means something
 * internally — it rides inside In production, because from the customer's side
 * the gi is not ready until we have checked it.
 */
const ORDER_STAGES = ['Ordered', 'In production', 'Shipped', 'Delivered'] as const;

const PRODUCTION_SUBLINE: Record<string, string> = {
  being_made: 'Being made',
  in_transit: 'In transit to our Brooklyn studio',
  quality_check: 'Final quality check',
};

/** Typical production time, shown while we have no promised date to quote. */
const LEAD_TIME_NOTE = 'Typically ready in 7 days';

const STAGE_ICONS = [Receipt, Scissors, Truck, House] as const;

// One lead time for everyone: seven days from the order. No destination zones
// and no separate transit leg — the quoted number is the number.
const LEAD_TIME_DAYS = 7;

function expectedArrival(order: LockerOrder): { value: string } | null {
  if (!order.processedAt) return null;
  const from = new Date(order.processedAt);
  if (Number.isNaN(from.getTime())) return null;
  from.setDate(from.getDate() + LEAD_TIME_DAYS);
  return { value: formatDate(from.toISOString()) };
}

const ORDER_GROUPS = ['Kimono', 'Belt', 'Pant', 'Rashguard', 'Grappling Short'] as const;

interface OrderProgress {
  index: number;
  subLine?: string;
  actionMessage?: string;
  tracking?: { company?: string; number?: string; url?: string };
  cancelled?: boolean;
}

/**
 * Shopify owns dispatch onwards, so its fulfilment data always wins over the
 * portal's production phase — a shipped order is shipped no matter what the
 * last published production state said.
 */
function orderProgress(order: LockerOrder): OrderProgress {
  const fulfillment = order.fulfillments?.find((entry) => entry.trackingNumber || entry.createdAt);
  const tracking = fulfillment
    ? {
        company: fulfillment.trackingCompany,
        number: fulfillment.trackingNumber,
        url: fulfillment.trackingUrl,
      }
    : undefined;

  if (order.cancelledAt) {
    return { index: 0, cancelled: true, actionMessage: order.cancelReason || 'Order cancelled' };
  }

  // Word-boundary matches only: "unfulfilled" CONTAINS "fulfil", so a plain
  // substring test marked every waiting order as shipped.
  const status = (order.fulfillmentStatus || '').toLowerCase();
  if (/\bdeliver/.test(status)) return { index: 3, tracking };
  if (fulfillment || /\bfulfilled\b/.test(status) || /\bpartial/.test(status) || /\bshipped\b/.test(status)) {
    return { index: 2, tracking };
  }

  // The PO decides how far an order has travelled: until the portal writes a
  // production stage, the truthful stage is Ordered — not In production.
  const production = order.productionStage;
  const actionMessage = production?.actionNeeded
    ? production.actionMessage || 'We need something from you to continue.'
    : undefined;
  if (production?.state) {
    return { index: 1, subLine: PRODUCTION_SUBLINE[production.state], actionMessage };
  }
  return { index: 0, actionMessage };
}

const STORE_ORIGIN = 'https://dspln.com';

async function authRequest(path: string, body: Record<string, unknown>) {
  const response = await fetch(new URL(`/api/auth${path}`, window.location.origin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error?.message || 'That did not work. Try again.');
  }
  return payload;
}

async function fetchLockerSession(): Promise<LockerSession> {
  const response = await fetch(new URL('/api/locker-session', window.location.origin), {
    credentials: 'include',
  });
  if (!response.ok) return { signedIn: false };
  return (await response.json()) as LockerSession;
}

type AuthMode = 'sign-in' | 'sign-up' | 'forgot';

/** DSPLN's own sign-in. Shopify stays available beneath it during the change. */
function LockerSignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(''); setSent('');
    try {
      if (mode === 'sign-up') {
        await authRequest('/sign-up/email', { email, password, name: name || email.split('@')[0] });
        onSignedIn();
      } else if (mode === 'sign-in') {
        await authRequest('/sign-in/email', { email, password });
        onSignedIn();
      } else {
        // Better Auth 1.7 renamed this from /forget-password; the old path
        // 404s silently, which reads to a customer as "nothing happened".
        await authRequest('/request-password-reset', {
          email, redirectTo: `${window.location.origin}/locker?reset=1`,
        });
        setSent('If that address has an account, a reset link is on its way.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const field =
    'w-full border border-[#d8d5cf] px-4 py-3 text-sm outline-none focus:border-[#1c1b1b]';

  return (
    <main className="min-h-screen bg-white font-sans text-[#1c1b1b]">
      <LockerHeader />
      <div className="mx-auto flex max-w-md flex-col px-6 py-16">
        <h1 className="text-2xl uppercase tracking-[0.2em]">The Locker</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#666]">
          {mode === 'sign-up'
            ? 'Create an account and your designs, uploads and orders live in one place.'
            : mode === 'forgot'
              ? 'We will email you a link to choose a new password.'
              : 'Sign in to your designs, uploads and orders.'}
        </p>

        <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
          {mode === 'sign-up' ? (
            <input className={field} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          ) : null}
          <input
            className={field} type="email" required placeholder="Email" value={email}
            onChange={(e) => setEmail(e.target.value)} autoComplete="email"
          />
          {mode !== 'forgot' ? (
            <input
              className={field} type="password" required minLength={8} placeholder="Password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            />
          ) : null}

          {error ? <p className="text-sm text-[#8a1c1c]">{error}</p> : null}
          {sent ? <p className="text-sm text-[#3d6b2f]">{sent}</p> : null}

          <button type="submit" disabled={busy} className={`mt-2 bg-[#1c1b1b] px-9 py-4 text-white ${label} disabled:opacity-50`}>
            {busy ? 'Working' : mode === 'sign-up' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Sign in'}
          </button>
        </form>

        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#666]">
          {mode !== 'sign-in' ? (
            <button type="button" className="underline underline-offset-2" onClick={() => { setMode('sign-in'); setError(''); }}>
              Sign in instead
            </button>
          ) : null}
          {mode !== 'sign-up' ? (
            <button type="button" className="underline underline-offset-2" onClick={() => { setMode('sign-up'); setError(''); }}>
              Create an account
            </button>
          ) : null}
          {mode === 'sign-in' ? (
            <button type="button" className="underline underline-offset-2" onClick={() => { setMode('forgot'); setError(''); }}>
              Forgot password
            </button>
          ) : null}
        </div>

        <div className="mt-10 border-t border-[#e6e4df] pt-6">
          <p className="text-xs leading-relaxed text-[#8a8580]">
            Ordered before? Use the same email you ordered with and everything you have already
            made will be waiting.
          </p>
          <a href={`${STORE_ORIGIN}/pages/locker`} className="mt-4 inline-block text-xs text-[#666] underline underline-offset-2">
            Or open the Locker from the DSPLN store
          </a>
        </div>
      </div>
    </main>
  );
}
const STORE_LOGO =
  'https://dspln.com/cdn/shop/t/26/assets/dspln-header-logo.webp?v=81944404610336235851784498170';

/**
 * The store's header, rebuilt for the standalone Locker.
 *
 * Matches the theme: white ground, thin rule, three-column grid with the mark
 * centred — so moving off the iframe does not feel like leaving DSPLN. Shown
 * only when the Locker is its own page; the portal's admin embed keeps its
 * chrome-free view.
 */
function LockerHeader({ email, onSignOut }: { email?: string; onSignOut?: () => void }) {
  return (
    <header className="sticky top-0 z-40 bg-[#1c1b1b] text-white">
      <div className="mx-auto grid max-w-[1600px] grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-3">
        <nav className="flex items-center gap-6">
          <a href={STORE_ORIGIN} className={`${label} text-white hover:opacity-75`}>Shop</a>
          <a
            href={`${STORE_ORIGIN}/pages/how-to-use-customizer`}
            className={`${label} hidden text-white hover:opacity-75 sm:inline`}
          >
            Guide
          </a>
        </nav>

        <a href={STORE_ORIGIN} aria-label="DSPLN" className="justify-self-center">
          <img
            src={STORE_LOGO}
            alt="DSPLN"
            width={200}
            height={42}
            className="h-[34px] w-auto sm:h-[42px]"
          />
        </a>

        <div className="flex items-center justify-end gap-5">
          {email ? (
            <span className="hidden max-w-[200px] truncate text-xs text-white/60 lg:inline">
              {email}
            </span>
          ) : null}
          {onSignOut ? (
            <button type="button" onClick={onSignOut} className={`${label} text-white hover:opacity-75`}>
              Log out
            </button>
          ) : null}
          <a href={`${STORE_ORIGIN}/cart`} className={`${label} text-white hover:opacity-75`}>Cart</a>
        </div>
      </div>
    </header>
  );
}

function OrderTimeline({ order }: { order: LockerOrder }) {
  const progress = orderProgress(order);
  const tracking = progress.tracking;

  // The order header lives INSIDE this card: number and status on the left,
  // arrival and tracking on the right, the rail beneath. One card answering
  // "which order, where is it, when does it land" instead of two saying
  // overlapping things.
  const stageDetail = (index: number) => {
    if (index === 0) {
      const refunded = /refund/i.test(order.financialStatus || '');
      return { when: formatDate(order.processedAt), sub: refunded ? 'Refunded' : 'Order received' };
    }
    if (index === 1) {
      return { when: '', sub: progress.index >= 1 ? (progress.subLine ?? LEAD_TIME_NOTE) : LEAD_TIME_NOTE };
    }
    if (index === 2) {
      return { when: '', sub: tracking ? 'On its way to you' : 'Tracking appears here' };
    }
    if (progress.index === 3) return { when: '', sub: 'Delivered' };
    const eta = expectedArrival(order);
    return { when: '', sub: eta ? `Expected ${eta.value}` : 'Estimated after dispatch' };
  };

  return (
    <div className="rounded-2xl border border-[#e5e5e2] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl uppercase tracking-[0.14em] sm:text-2xl">
            Order <span className="text-[#5c0000]">{order.name}</span>
          </h2>
          {order.cancelledAt ? (
            <p className="mt-2 text-sm text-[#8a1c1c]">
              Cancelled {formatDate(order.cancelledAt)}
              {order.cancelReason ? ` · ${order.cancelReason}` : ''}
            </p>
          ) : null}
        </div>

        <div className="text-left text-sm leading-relaxed sm:text-right">

          {tracking?.number ? (
            <p className="break-all text-[#666]">
              {tracking.company ?? 'Tracking'}{' '}
              {tracking.url ? (
                <a href={tracking.url} target="_blank" rel="noreferrer" className="font-medium text-[#1c1b1b] underline underline-offset-2">
                  {tracking.number}
                </a>
              ) : (
                <span className="font-medium text-[#1c1b1b]">{tracking.number}</span>
              )}
            </p>
          ) : (
            <p className="text-[#999]">Tracking appears here once it ships</p>
          )}
        </div>
      </div>

      {progress.actionMessage ? (
        <p className="mt-6 border border-[#842323] bg-[#fdf6f6] px-4 py-3 text-sm text-[#842323]">
          <span className={`${label} mr-2`}>Action needed</span>
          {progress.actionMessage}
        </p>
      ) : null}

      {/* Phones get a vertical rail on the RIGHT with the icon and label to its
          left — a horizontal rail squeezed to 375px puts four labels in a row
          too narrow to read. */}
      <ol className="mt-7 sm:hidden">
        {ORDER_STAGES.map((stage, index) => {
          const reached = !progress.cancelled && index <= progress.index;
          const current = !progress.cancelled && index === progress.index;
          const detail = stageDetail(index);
          const StageIcon = STAGE_ICONS[index] ?? Receipt;
          const isLast = index === ORDER_STAGES.length - 1;
          return (
            <li
              key={stage}
              className={`relative grid grid-cols-[38px_minmax(0,1fr)_24px] items-start gap-3 ${isLast ? '' : 'pb-7'}`}
            >
              <StageIcon
                size={32}
                strokeWidth={1.25}
                aria-hidden="true"
                className={`mt-0.5 shrink-0 ${reached ? 'text-[#5c0000]' : 'text-[#c9c7c1]'}`}
              />
              <div className="min-w-0">
                <p className={`text-sm font-semibold uppercase tracking-[0.06em] ${reached ? 'text-[#1c1b1b]' : 'text-[#a5a09a]'}`}>
                  {stage}
                </p>
                {detail.when ? (
                  <p className="mt-1 text-[11px] tabular-nums text-[#8a8580]">{detail.when}</p>
                ) : null}
                {detail.sub ? (
                  <p className="mt-0.5 text-[11px] leading-snug text-[#8a8580]">{detail.sub}</p>
                ) : null}
              </div>
              <div className="relative flex h-full justify-center">
                {!isLast ? (
                  <span
                    aria-hidden="true"
                    className={`absolute left-1/2 top-[21px] bottom-[-8px] w-[3px] -translate-x-1/2 rounded-full ${
                      index < progress.index && !progress.cancelled ? 'bg-[#5c0000]' : 'bg-[#e6e4df]'
                    }`}
                  />
                ) : null}
                <span
                  aria-hidden="true"
                  className={`relative z-10 mt-0.5 flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full ${
                    current
                      ? 'bg-[#5c0000] text-white ring-4 ring-[#5c0000]/15'
                      : reached
                        ? 'bg-[#5c0000] text-white'
                        : 'bg-white ring-[3px] ring-[#e6e4df]'
                  }`}
                >
                  {reached ? <Check size={12} strokeWidth={3.5} /> : null}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      <ol className="mt-8 hidden sm:flex sm:flex-row sm:gap-0">
        {ORDER_STAGES.map((stage, index) => {
          const reached = !progress.cancelled && index <= progress.index;
          const current = !progress.cancelled && index === progress.index;
          const detail = stageDetail(index);
          const StageIcon = STAGE_ICONS[index] ?? Receipt;
          const isLast = index === ORDER_STAGES.length - 1;
          return (
            <li key={stage} className="relative min-w-0 flex-1 sm:pr-5">
              <div
                aria-hidden="true"
                className={`h-[3px] w-full rounded-full ${
                  isLast
                    ? 'bg-transparent'
                    : index < progress.index && !progress.cancelled
                      ? 'bg-[#5c0000]'
                      : 'bg-[#e6e4df]'
                }`}
              />
              <span
                aria-hidden="true"
                className={`absolute left-0 top-[-9px] flex h-[21px] w-[21px] items-center justify-center rounded-full ${
                  current
                    ? 'bg-[#5c0000] text-white ring-4 ring-[#5c0000]/15'
                    : reached
                      ? 'bg-[#5c0000] text-white'
                      : 'bg-white ring-[3px] ring-[#e6e4df]'
                }`}
              >
                {reached ? <Check size={12} strokeWidth={3.5} /> : null}
              </span>

              <div className="mt-6 flex items-start gap-3">
                <StageIcon
                  size={34}
                  strokeWidth={1.25}
                  aria-hidden="true"
                  className={`shrink-0 ${reached ? 'text-[#5c0000]' : 'text-[#c9c7c1]'}`}
                />
                <div className="min-w-0">
                  <p className={`text-sm font-semibold leading-tight ${reached ? 'text-[#1c1b1b]' : 'text-[#a5a09a]'}`}>
                    {stage}
                  </p>
                  {detail.when ? (
                    <p className="mt-1 text-[11px] tabular-nums text-[#8a8580]">{detail.when}</p>
                  ) : null}
                  {detail.sub ? (
                    <p className="mt-0.5 pr-2 text-[11px] leading-snug text-[#8a8580]">{detail.sub}</p>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {progress.cancelled ? (
        <p className="mt-5 text-xs text-[#842323]">{progress.actionMessage}</p>
      ) : null}
    </div>
  );
}

function cleanOrderTitle(item: NonNullable<LockerOrder['items']>[number]): string {
  return (item.productTitle || item.title).replace(/\s+-\s+tda_price[_-]?\d*.*$/i, '').trim();
}

function customerProperties(item: NonNullable<LockerOrder['items']>[number]) {
  return (item.properties ?? [])
    .map((property) => ({
      name: property.name.trim().replace(/^_+/, ''),
      value: String(property.value ?? '').trim(),
    }))
    .filter(({ name, value }) => {
      if (!name || !value) return false;
      const key = name.toLowerCase();
      return !(
        key.includes('production') ||
        key.includes('tech pack') ||
        key.includes('preview_image') ||
        key.includes('preview image') ||
        key.includes('json') ||
        key.includes('dspln_') ||
        key.includes('configurator_id') ||
        key.includes('mczr') ||
        key === 'custom design saved' ||
        key === '3d design'
      );
    });
}

function groupedOrderProperties(item: NonNullable<LockerOrder['items']>[number]) {
  const properties = customerProperties(item);
  return ORDER_GROUPS.map((group) => {
    const prefix = `${group.toLowerCase()} `;
    const rows = properties
      .filter(({ name }) => {
        const key = name.toLowerCase();
        return key === group.toLowerCase() || key.startsWith(prefix);
      })
      .flatMap(({ name, value }) => {
        const key = name.toLowerCase();
        if (key === group.toLowerCase()) {
          if (/^(yes|no|add\s)/i.test(value)) return [];
          return value.split('|').map((segment, index) => {
            const colon = segment.indexOf(':');
            return colon > -1
              ? { label: segment.slice(0, colon).trim(), value: segment.slice(colon + 1).trim() }
              : { label: index === 0 ? 'Size' : 'Detail', value: segment.trim() };
          });
        }
        return [{ label: name.slice(group.length).trim(), value }];
      })
      .filter((row) => row.value);
    return { group, rows };
  }).filter(({ rows }) => rows.length);
}

async function fetchDesigns(customer: LockerCustomer): Promise<LockerDesign[]> {
  const url = new URL('/api/customer-designs', window.location.origin);
  url.searchParams.set('ownerKey', ownerKey(customer));
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not load saved designs.');
  const payload = await response.json();
  return payload?.data?.designs ?? [];
}

// DSPLN's own order archive, written by the order webhook at checkout. The
// storefront/portal can still post richer or older context; see the merge in
// receiveStorefrontContext — archived rows win on ties, context fills gaps.
async function fetchArchivedOrders(customer: LockerCustomer): Promise<LockerOrder[]> {
  const url = new URL('/api/customer-designs', window.location.origin);
  url.searchParams.set('ownerKey', ownerKey(customer));
  url.searchParams.set('orders', '1');
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not load orders.');
  const payload = await response.json();
  return payload?.data?.orders ?? [];
}

function mergeOrders(primary: LockerOrder[], secondary: LockerOrder[]): LockerOrder[] {
  const byId = new Map<string, LockerOrder>();
  // secondary first so primary overwrites on the same order id
  secondary.forEach((order) => byId.set(String(order.id), order));
  primary.forEach((order) => {
    const existing = byId.get(String(order.id));
    // Never let a thin row replace one that has line items.
    byId.set(
      String(order.id),
      existing && (existing.items?.length ?? 0) > 0 && (order.items?.length ?? 0) === 0
        ? { ...order, items: existing.items, billingAddress: order.billingAddress ?? existing.billingAddress, shippingAddress: order.shippingAddress ?? existing.shippingAddress }
        : order,
    );
  });
  return [...byId.values()].sort((a, b) => String(b.processedAt).localeCompare(String(a.processedAt)));
}

async function fetchOrderThread(customer: LockerCustomer, orderId: string): Promise<OrderEvent[]> {
  const url = new URL('/api/order-thread', window.location.origin);
  url.searchParams.set('ownerKey', ownerKey(customer));
  url.searchParams.set('orderId', orderId);
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not load this order\u2019s activity.');
  const payload = await response.json();
  return payload?.data?.events ?? [];
}

interface ChatAttachment { id: string; filename: string; contentType: string; bytes: number }

function attachmentUrl(customer: LockerCustomer, orderId: string, attachmentId: string) {
  const url = new URL('/api/order-thread', window.location.origin);
  url.searchParams.set('ownerKey', ownerKey(customer));
  url.searchParams.set('orderId', orderId);
  url.searchParams.set('attachment', attachmentId);
  return url.toString();
}

/**
 * Phone photos are routinely 5-10MB, well past what a function body accepts,
 * so shrink before sending rather than failing at the door.
 */
async function shrinkImage(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
  if (file.type === 'image/gif') return dataUrl; // resizing would kill the animation

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('That image could not be read.'));
    el.src = dataUrl;
  });
  const MAX = 1600;
  const scale = Math.min(1, MAX / Math.max(image.width, image.height));
  if (scale === 1 && dataUrl.length < 3_000_000) return dataUrl;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.85);
}

async function postOrderMessage(
  customer: LockerCustomer,
  orderId: string,
  body: string,
  attachment?: { dataUrl: string; filename: string } | null,
) {
  const response = await fetch(new URL('/api/order-thread', window.location.origin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ownerKey: ownerKey(customer), orderId, type: 'chat', body,
      attachment: attachment ?? null,
      actorName: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || null,
    }),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    throw new Error(failure?.error || 'Message could not be sent.');
  }
  const payload = await response.json();
  return payload?.data?.event as OrderEvent;
}

function eventTone(type: OrderEvent['type']) {
  if (type === 'stage') return { dot: 'bg-[#1c1b1b]', tag: 'Stage' };
  if (type === 'email') return { dot: 'bg-[#c9c7c1]', tag: 'Email' };
  if (type === 'chat') return { dot: 'bg-[#842323]', tag: 'Message' };
  if (type === 'production') return { dot: 'bg-[#c9c7c1]', tag: 'Production' };
  if (type === 'order-edit') return { dot: 'bg-[#c9c7c1]', tag: 'Update' };
  if (type === 'file') return { dot: 'bg-[#c9c7c1]', tag: 'File' };
  return { dot: 'bg-[#c9c7c1]', tag: 'Note' };
}

/**
 * The order's conversation, styled as the Design Assistant panel in the
 * configurator so the two read as one product. Chat is bubbles; stage and
 * email events are quiet centre lines between them, the way a messaging app
 * shows "delivered" — one thread, without the log drowning the conversation.
 */
function OrderChatPanel({ customer, order }: { customer: LockerCustomer; order: LockerOrder }) {
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<{ dataUrl: string; filename: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const attach = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Only images can be attached.');
      return;
    }
    try {
      setPending({ dataUrl: await shrinkImage(file), filename: file.name });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That image could not be read.');
    }
  };

  useEffect(() => {
    let live = true;
    setLoaded(false);
    fetchOrderThread(customer, String(order.id))
      .then((list) => { if (live) { setEvents(list); setLoaded(true); } })
      .catch(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [customer, order.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [events]);

  const send = async () => {
    const body = draft.trim();
    if ((!body && !pending) || sending) return;
    setSending(true);
    try {
      const created = await postOrderMessage(customer, String(order.id), body, pending);
      setEvents((current) => [...current, created]);
      setDraft('');
      setPending(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Message could not be sent.');
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="flex h-[min(30rem,70dvh)] flex-col overflow-hidden rounded-2xl border border-[#e3ded7] bg-white shadow-lg">
      <header className="flex items-center gap-2 border-b border-[#eee9e2] bg-[#faf8f5] px-4 py-3">
        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#5c0000] text-[8px] font-bold tracking-[-0.04em] text-white">
          DS
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1c1b1b]">
            Order chat
          </p>
          <p className="truncate text-[11px] text-[#8a8580]">
            Ask us anything about {order.name}
          </p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {loaded && !events.length ? (
          <p className="mr-8 rounded-2xl rounded-bl-md bg-[#f4f1ec] px-3.5 py-2 text-[13px] leading-snug text-[#1c1b1b]">
            Hi{customer.firstName ? ` ${customer.firstName}` : ''} — questions about this order come
            straight to us here.
          </p>
        ) : null}

        {events.map((event) => {
          if (event.type !== 'chat') {
            return (
              <p key={event.id} className="py-1 text-center text-[11px] text-[#a5a09a]">
                {event.title} · {formatDate(event.createdAt)}
              </p>
            );
          }
          const mine = event.actor?.kind === 'customer';
          const attachments = (event.payload?.attachments ?? []) as ChatAttachment[];
          return (
            <div
              key={event.id}
              className={
                mine
                  ? 'ml-8 rounded-2xl rounded-br-md bg-[#1c1b1b] px-3.5 py-2 text-[13px] leading-snug text-white'
                  : 'mr-8 rounded-2xl rounded-bl-md bg-[#f4f1ec] px-3.5 py-2 text-[13px] leading-snug text-[#1c1b1b]'
              }
            >
              {attachments.map((file) => (
                <a
                  key={file.id}
                  href={attachmentUrl(customer, String(order.id), file.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="mb-2 block"
                >
                  <img
                    src={attachmentUrl(customer, String(order.id), file.id)}
                    alt={file.filename}
                    className="max-h-48 w-full rounded-lg bg-white/90 object-contain"
                  />
                </a>
              ))}
              {event.body}
            </div>
          );
        })}
      </div>

      {pending ? (
        <div className="flex items-center gap-2 border-t border-[#eee9e2] bg-[#faf8f5] px-3 py-2">
          <img src={pending.dataUrl} alt="" className="h-10 w-10 rounded-md object-cover" />
          <span className="min-w-0 flex-1 truncate text-[11px] text-[#8a8580]">{pending.filename}</span>
          <button
            type="button"
            onClick={() => setPending(null)}
            aria-label="Remove image"
            className="rounded-full p-1 text-[#8a8580] hover:bg-[#f0ece6]"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      <div className="flex items-end gap-2 border-t border-[#eee9e2] bg-white px-3 py-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { void attach(e.target.files?.[0]); e.target.value = ''; }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label="Attach an image"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f4f1ec] text-[#5c5852] hover:bg-[#ece7e0]"
        >
          <ImagePlus size={16} />
        </button>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
          }}
          rows={1}
          placeholder="Ask us about this order"
          className="max-h-24 min-h-[2.25rem] flex-1 resize-none rounded-xl bg-[#f4f1ec] px-3 py-2 text-[13px] leading-snug outline-none placeholder:text-[#a5a09a]"
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || (!draft.trim() && !pending)}
          className="h-9 shrink-0 rounded-xl bg-[#1c1b1b] px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-white disabled:opacity-40"
        >
          {sending ? '…' : 'Send'}
        </button>
      </div>
    </section>
  );
}

async function fetchUploads(customer: LockerCustomer): Promise<LockerUpload[]> {
  const url = new URL('/api/customer-designs', window.location.origin);
  url.searchParams.set('ownerKey', ownerKey(customer));
  url.searchParams.set('logos', '1');
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not load uploaded artwork.');
  const payload = await response.json();
  const uploads: LockerUpload[] = payload?.data?.logos ?? [];
  const seen = new Set<string>();
  return uploads.filter((upload) => {
    // The API dedupes across Studio artwork and design logos and returns its
    // key; fall back to url+filename for older responses.
    const key = upload.dedupeKey || `${upload.url}|${upload.filename ?? ''}`;
    if (!upload.url || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Studio save: the image bytes go through the existing upload function and
 * only the hosted URL plus metadata is persisted, so artwork records stay
 * small and the blob store keeps the pixels.
 */
async function saveArtworkRecord(
  customer: LockerCustomer,
  blob: Blob,
  meta: { filename: string; width: number; height: number; aiEdited?: boolean },
): Promise<{ id: string; url: string } | null> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read the artwork.'));
    reader.readAsDataURL(blob);
  });

  const hostedUrl = await uploadArtworkImage(dataUrl);
  if (!hostedUrl) throw new Error('Artwork upload failed. Please try again.');

  const response = await fetch('/api/customer-designs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'artwork',
      ownerKey: ownerKey(customer),
      url: hostedUrl,
      filename: meta.filename,
      width: meta.width,
      height: meta.height,
      revisionType: meta.aiEdited ? 'ai-edit' : 'manual-edit',
    }),
  });

  if (!response.ok) throw new Error('Could not save artwork to your Locker.');
  const payload = await response.json();
  const artwork = payload?.data?.artwork;
  if (!artwork?.id || !artwork?.url) return null;
  return { id: artwork.id, url: artwork.url };
}

/**
 * Guest work is claimed by POSSESSION of the guest tokens sitting in this
 * browser's localStorage — the configurators and the Locker are both the
 * Netlify app, so they share an origin and therefore share localStorage.
 * Possession is per-device on purpose: designs made on a phone stay on the
 * phone's guest token until that browser signs in.
 */
const GUEST_TOKEN_KEYS = Object.values(GI_PRODUCT_CONFIGS).map(
  (config) => config.guestTokenStorageKey,
);

function readGuestTokens(): Array<{ storageKey: string; token: string }> {
  if (typeof window === 'undefined') return [];
  return GUEST_TOKEN_KEYS.flatMap((storageKey) => {
    try {
      const token = window.localStorage.getItem(storageKey)?.trim();
      return token ? [{ storageKey, token }] : [];
    } catch {
      return [];
    }
  });
}

/**
 * Moves any guest designs/artwork held in this browser into the signed-in
 * Locker. Quiet and non-blocking: on failure the tokens stay in localStorage
 * so the next visit retries. Returns how many records moved.
 */
async function claimGuestWork(customer: LockerCustomer): Promise<number> {
  const held = readGuestTokens();
  if (!held.length) return 0;

  const response = await fetch('/api/customer-designs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'claim-guest',
      ownerKey: ownerKey(customer),
      guestTokens: held.map((entry) => entry.token),
    }),
  });
  if (!response.ok) throw new Error('Could not claim guest designs.');

  const payload = await response.json();
  const claimed = payload?.data?.claimed ?? {};
  // Anything left behind by a partial failure keeps its token so the next
  // Locker visit picks it up.
  if (!claimed.failed) {
    held.forEach((entry) => {
      try {
        window.localStorage.removeItem(entry.storageKey);
      } catch {
        // A locked-down storage just means we retry next visit.
      }
    });
  }
  return Number(claimed.designs ?? 0) + Number(claimed.artwork ?? 0);
}

async function fetchFit(customer: LockerCustomer): Promise<FitProfile> {
  const url = new URL('/api/customer-fit', window.location.origin);
  url.searchParams.set('ownerKey', ownerKey(customer));
  const response = await fetch(url);
  if (response.status === 404) return emptyFit;
  if (!response.ok) throw new Error('Could not load your sizing profile.');
  const payload = await response.json();
  return { ...emptyFit, ...(payload?.data?.profile ?? {}) };
}

function StatusBadge({ value }: { value: string }) {
  return (
    <span className={`inline-flex border border-[#d7d7d7] px-3 py-1 ${label}`}>
      {(value || 'Pending').replaceAll('_', ' ')}
    </span>
  );
}

async function indexLockerCustomer(customer: LockerCustomer, orders?: LockerOrder[]) {
  await fetch('/api/locker-customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ownerKey: ownerKey(customer),
      shopDomain: customer.shopDomain,
      customerId: customer.customerId,
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      ...(orders ? { orders } : {}),
    }),
  }).catch(() => undefined);
}

export function TheLocker() {
  // Identity has two sources now: the storefront hands one over in the URL,
  // or the visitor is signed in with a DSPLN account. The URL wins so the
  // embedded Locker and the portal's admin view keep working unchanged.
  const urlCustomer = useMemo(queryCustomer, []);

  // The storefront used to hand identity over inside an iframe src. Now that
  // /pages/locker navigates here outright, those same params sit in the visible
  // address bar and in history — so read them once, then take them back out.
  useEffect(() => {
    if (!urlCustomer || typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      let touched = false;
      ['customerId', 'customerEmail', 'firstName', 'lastName', 'shop', 'storefrontOrigin'].forEach((key) => {
        if (url.searchParams.has(key)) { url.searchParams.delete(key); touched = true; }
      });
      if (touched) window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    } catch { /* an unscrubbed URL is cosmetic — never break the Locker over it */ }
  }, [urlCustomer]);
  const [sessionCustomer, setSessionCustomer] = useState<LockerCustomer | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  const loadSession = useCallback(async () => {
    try {
      const session = await fetchLockerSession();
      if (session.signedIn && session.user) {
        const [first, ...rest] = (session.user.name || '').split(' ');
        setSessionCustomer({
          customerId: session.shopifyCustomerId ?? session.user.id,
          email: session.user.email,
          firstName: first ?? '',
          lastName: rest.join(' '),
          shopDomain: session.shopDomain ?? 'f39242.myshopify.com',
          storefrontOrigin: STORE_ORIGIN,
          ownerKeyOverride: session.ownerKey,
          dsplnAccount: true,
        });
      } else {
        setSessionCustomer(null);
      }
    } catch {
      setSessionCustomer(null);
    } finally {
      setSessionChecked(true);
    }
  }, []);

  useEffect(() => {
    if (urlCustomer) { setSessionChecked(true); return; }
    void loadSession();
  }, [urlCustomer, loadSession]);

  const signOut = useCallback(async () => {
    try {
      // Better Auth rejects a bodyless POST with 415 — it wants JSON.
      await fetch(new URL('/api/auth/sign-out', window.location.origin), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
    } catch { /* signing out must not strand anyone on an error screen */ }
    window.location.reload();
  }, []);

  const customer = urlCustomer ?? sessionCustomer;
  // Embedded means someone else draws the chrome — the storefront page, or the
  // portal's admin view. Standing alone, the Locker draws the store header
  // itself so leaving the iframe does not feel like leaving DSPLN.
  const isEmbedded = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get('embedded') === '1';
    } catch {
      return false;
    }
  }, []);
  const [page, setPage] = useState<LockerPage>(() => {
    try {
      const wanted = new URLSearchParams(window.location.search).get('page');
      if (wanted === 'design-tool' || wanted === 'designs' || wanted === 'uploads' || wanted === 'fit' || wanted === 'orders') {
        return wanted;
      }
    } catch {
      // fall through
    }
    return 'designs';
  });
  const [designs, setDesigns] = useState<LockerDesign[]>([]);
  const [uploads, setUploads] = useState<LockerUpload[]>([]);
  const [orders, setOrders] = useState<LockerOrder[]>([]);
  const [fit, setFit] = useState<FitProfile>(emptyFit);
  const [selectedDesign, setSelectedDesign] = useState<LockerDesign | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<LockerOrder | null>(null);
  const [loading, setLoading] = useState(Boolean(customer));
  const [savingFit, setSavingFit] = useState(false);
  const [error, setError] = useState('');

  const saveStudioArtwork = useCallback(
    async (
      blob: Blob,
      meta: { filename: string; width: number; height: number; aiEdited?: boolean },
    ) => {
      if (!customer) throw new Error('Sign in again to save artwork to your Locker.');
      return saveArtworkRecord(customer, blob, meta);
    },
    [customer],
  );

  const loadLocker = useCallback(async () => {
    if (!customer) return;
    setLoading(true);
    setError('');
    // Claim first so the listings below already include the guest work. A
    // claim failure must never break the Locker — log it and move on.
    let claimedCount = 0;
    try {
      claimedCount = await claimGuestWork(customer);
    } catch (cause) {
      console.warn('[locker] guest claim failed', cause);
    }
    const results = await Promise.allSettled([
      fetchDesigns(customer),
      fetchUploads(customer),
      fetchFit(customer),
      fetchArchivedOrders(customer),
    ]);
    if (results[0].status === 'fulfilled') setDesigns(results[0].value);
    if (results[1].status === 'fulfilled') setUploads(results[1].value);
    if (results[2].status === 'fulfilled') setFit(results[2].value);
    if (results[3].status === 'fulfilled' && results[3].value.length) {
      const archived = results[3].value;
      setOrders((current) => mergeOrders(archived, current));
    }
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') {
      setError(failure.reason instanceof Error ? failure.reason.message : 'Could not load the Locker.');
    }
    setLoading(false);
    if (claimedCount > 0) {
      toast.success(
        claimedCount === 1
          ? 'Added 1 design you made before signing in'
          : `Added ${claimedCount} items you made before signing in`,
      );
    }
  }, [customer]);

  // A hidden tab must also be an unreachable page: ?page=design-tool would
  // otherwise open the un-shipped Studio on the live store.
  useEffect(() => {
    const devStore = customer?.shopDomain === 'dspln-dev-2.myshopify.com';
    if (!devStore && (page === 'design-tool' || page === 'fit')) setPage('designs');
  }, [page, customer]);

  useEffect(() => {
    void loadLocker();
    if (customer) void indexLockerCustomer(customer);
  }, [loadLocker]);

  useEffect(() => {
    const receiveStorefrontContext = (event: MessageEvent) => {
      if (!customer || event.origin !== customer.storefrontOrigin) return;
      const data = event.data;
      if (data?.type !== 'dspln:locker:context') return;
      if (String(data.customerId) !== customer.customerId) return;
      const storefrontOrders = Array.isArray(data.orders) ? data.orders : [];
      // DSPLN's archived rows carry items and addresses for newer orders; the
      // posted context covers history from before archiving. Merge, don't
      // replace — whichever row has the real contents wins.
      setOrders((current) => mergeOrders(current, storefrontOrders));
      void indexLockerCustomer(customer, storefrontOrders);
    };
    window.addEventListener('message', receiveStorefrontContext);
    window.parent?.postMessage({ type: 'dspln:locker:ready' }, customer?.storefrontOrigin ?? '*');
    return () => window.removeEventListener('message', receiveStorefrontContext);
  }, [customer]);

  const saveFit = async () => {
    if (!customer) return;
    setSavingFit(true);
    try {
      const response = await fetch('/api/customer-fit', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerKey: ownerKey(customer), profile: fit }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not save your sizing profile.');
      setFit({ ...fit, updatedAt: payload?.data?.profile?.updatedAt });
      toast.success('Sizing and fit profile saved');
    } catch (cause) {
      toast.error((cause as Error).message);
    } finally {
      setSavingFit(false);
    }
  };

  if (!customer) {
    // Don't flash a sign-in form at someone who is already signed in.
    if (!sessionChecked) {
      return <main className="min-h-screen bg-white font-sans" aria-busy="true" />;
    }
    return <LockerSignIn onSignedIn={() => { void loadSession(); }} />;
  }

  const initials =
    `${customer.firstName.slice(0, 1)}${customer.lastName.slice(0, 1)}`.toUpperCase() || 'D';
  const displayName =
    [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.email;
  // Sizing / Fit and the Artwork Studio are still being designed — dev store
  // only until approved for live. Gating here rather than holding the whole
  // branch back means the tested work (order mirror, timeline, uploads) can
  // ship without carrying the untested UI with it.
  const DEV_STORE = 'dspln-dev-2.myshopify.com';
  const showFit = customer.shopDomain === DEV_STORE;
  const showStudio = customer.shopDomain === DEV_STORE;
  // `short` is the phone label: five tabs do not fit at 375px, and the row is
  // whitespace-nowrap so a long label spills rather than wrapping.
  const nav: Array<{ id: LockerPage; text: string; short?: string }> = [
    ...(showStudio ? [{ id: 'design-tool' as const, text: 'Design Tool', short: 'Studio' }] : []),
    { id: 'designs', text: 'Designs' },
    { id: 'uploads', text: 'Uploads' },
    ...(showFit ? [{ id: 'fit' as const, text: 'Sizing / Fit', short: 'Fit' }] : []),
    { id: 'orders', text: 'Orders' },
  ];

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-white font-sans text-[#1c1b1b]">
      {!isEmbedded ? (
        <LockerHeader
          email={customer.email}
          onSignOut={customer.dsplnAccount ? signOut : undefined}
        />
      ) : null}
      {/* Stacked (mobile) rows must not stretch: the profile band stays
          content-height and the main area absorbs the leftover screen. */}
      <div className="grid min-h-screen w-full min-w-0 grid-cols-1 grid-rows-[auto_1fr] lg:grid-cols-[84px_300px_minmax(0,1fr)] lg:grid-rows-1">
        <nav className="hidden min-h-screen flex-col items-center bg-[#1c1b1b] px-2 py-6 lg:flex">
          <a
            href={customer.storefrontOrigin}
            target="_top"
            aria-label="DSPLN home"
            className="mb-8 flex h-9 w-9 items-center justify-center border border-white/40 text-white"
          >
            D
          </a>
          <a
            href={customer.storefrontOrigin}
            target="_top"
            className="dspln-locker-rail-link w-full px-1 py-3 text-center text-[#aaa] hover:text-white"
          >
            Home
          </a>
          <a
            href={`${customer.storefrontOrigin}/collections/all`}
            target="_top"
            className="dspln-locker-rail-link w-full px-1 py-3 text-center text-[#aaa] hover:text-white"
          >
            Shop
          </a>
          <button
            type="button"
            onClick={() => {
              setPage('designs');
              setSelectedDesign(null);
            }}
            className="dspln-locker-rail-link w-full px-1 py-3 text-center text-white"
          >
            Locker
          </button>
          <a
            href={`${customer.storefrontOrigin}/account/logout`}
            target="_top"
            className="dspln-locker-rail-link mt-auto w-full px-1 py-3 text-center text-[#aaa] hover:text-white"
          >
            Log out
          </a>
        </nav>

        <aside className="flex min-w-0 items-center gap-4 bg-[#f5f5f5] px-4 py-4 text-left lg:block lg:min-h-screen lg:px-7 lg:py-8 lg:text-center">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#1c1b1b] text-base tracking-[0.12em] text-white lg:mx-auto lg:h-20 lg:w-20 lg:text-xl">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] uppercase tracking-[0.08em] lg:mt-5 lg:text-[15px]">{displayName}</p>
            <p className="mt-1 truncate text-[11px] text-[#666] lg:break-all lg:text-[13px]">{customer.email}</p>
          </div>
          <div className="shrink-0 border-l border-[#d8d8d8] pl-4 lg:mt-7 lg:border-l-0 lg:border-t lg:pl-0 lg:pt-6">
            <p className={`${label} mb-2`}>Member of DSPLN</p>
            <p className="text-[11px] leading-relaxed text-[#666] lg:text-[13px]">
              {designs.length} design{designs.length === 1 ? '' : 's'} · {uploads.length} upload
              {uploads.length === 1 ? '' : 's'} · {orders.length} order
              {orders.length === 1 ? '' : 's'}
            </p>
          </div>
        </aside>

        <main className="min-w-0 max-w-full overflow-x-hidden px-4 py-6 lg:px-12 lg:py-8">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-[#ddd] pb-5">
            <div>
              <p className={`${label} text-[#777]`}>The Locker</p>
              <h1 className="mt-2 text-xl uppercase tracking-[0.2em]">
                {selectedDesign ? selectedDesign.name || 'Saved Design' : nav.find((entry) => entry.id === page)?.text}
              </h1>
            </div>
            {error ? <p className="text-sm text-[#842323]">{error}</p> : null}
          </div>

          {/*
            Segmented control rather than underlined tabs: at phone width the
            four labels were squeezed to the point that "Sizing / Fit" wrapped
            onto two lines and the row looked broken. A pill track keeps every
            label on one line, and the raised white pill reads as "selected"
            far more clearly than a 2px underline on a small screen.
          */}
          <nav
            aria-label="Locker pages"
            className="mb-7 flex w-full min-w-0 gap-0.5 rounded-full bg-[#f1f1ee] p-1 sm:gap-1 sm:p-1.5"
          >
            {nav.map((entry) => (
              <button
                key={entry.id}
                type="button"
                aria-current={page === entry.id ? 'page' : undefined}
                onClick={() => {
                  setPage(entry.id);
                  setSelectedDesign(null);
                }}
                className={`dspln-locker-tab min-w-0 flex-1 whitespace-nowrap rounded-full px-1.5 py-2 font-semibold uppercase transition-colors duration-150 sm:px-4 sm:py-2.5 ${
                  page === entry.id
                    ? 'bg-white text-[#1c1b1b] shadow-[0_1px_2px_rgba(0,0,0,0.08)]'
                    : 'text-[#75756e] hover:text-[#1c1b1b]'
                }`}
              >
                {entry.short ? (
                  <>
                    <span className="sm:hidden">{entry.short}</span>
                    <span className="hidden sm:inline">{entry.text}</span>
                  </>
                ) : (
                  entry.text
                )}
              </button>
            ))}
          </nav>

          {loading ? <p className={`${label} py-12 text-center text-[#777]`}>Loading Locker…</p> : null}

          {!loading && page === 'design-tool' ? (
            <section>
              <ArtworkStudioPage
                ownerKey={ownerKey(customer)}
                onSave={saveStudioArtwork}
                onSaved={() => {
                  // The new artwork belongs in Uploads straight away.
                  void fetchUploads(customer).then(setUploads).catch(() => undefined);
                }}
                uploadsHref="#"
                onUseOnProduct={() => setPage('uploads')}
              />

              <h2 className="mt-14 text-lg uppercase tracking-[0.12em]">
                Use artwork on a product
              </h2>
              <div className="mt-4 max-w-3xl">
                <p className="text-sm leading-relaxed text-[#666]">
                  Start a new product in DSPLN’s 3D design tools. The built-in Design Assistant can
                  help choose colors, place uploaded artwork, create new artwork, and refine the
                  design while you work. Save the result and it will appear in your Locker.
                </p>
              </div>
              <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  ['Men’s Gi', 'customgi'],
                  ['Women’s Gi', 'womens-custom-gi-suit'],
                  ['Kids Gi', 'custom-kids-gi'],
                ].map(([name, handle]) => (
                  <article key={handle} className="border border-[#ddd] bg-[#f7f7f7] p-6">
                    <p className={label}>3D Configurator</p>
                    <h2 className="mt-3 text-lg uppercase tracking-[0.12em]">{name}</h2>
                    <p className="mt-4 text-sm leading-relaxed text-[#666]">
                      Customize every available part, upload logos, and ask the Design Assistant for help.
                    </p>
                    <a
                      href={`${customer.storefrontOrigin}/products/${handle}?assistant=1`}
                      target="_top"
                      className={`mt-6 inline-flex bg-[#1c1b1b] px-6 py-4 text-white ${label}`}
                    >
                      Open Design Tool
                    </a>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {!loading && page === 'designs' ? (
            <section>
              {selectedDesign ? (
                <div className="-m-4 min-h-full bg-[#f4f4f2] p-4 sm:-m-8 sm:p-8">
                  <button
                    type="button"
                    onClick={() => setSelectedDesign(null)}
                    className={`${label} mb-6 underline underline-offset-4`}
                  >
                    ← All designs
                  </button>
                  <div className="grid gap-8 lg:grid-cols-[minmax(0,560px)_minmax(280px,1fr)]">
                    <div className="aspect-square border border-[#ddd] bg-[#f7f7f7]">
                      {selectedDesign.thumbnailUrl ? (
                        <img
                          src={selectedDesign.thumbnailUrl}
                          alt={selectedDesign.name || 'Saved design'}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className={`flex h-full items-center justify-center text-[#999] ${label}`}>
                          Preview pending
                        </div>
                      )}
                    </div>
                    <div className="self-start border-t border-[#ddd] pt-6">
                      <p className={label}>Saved design</p>
                      <h2 className="mt-3 text-xl uppercase tracking-[0.12em]">
                        {selectedDesign.name || 'Saved Design'}
                      </h2>
                      <p className="mt-3 text-sm text-[#777]">
                        Last edited {formatDate(selectedDesign.updatedAt)}
                      </p>
                      <p className="mt-7 text-sm leading-relaxed text-[#666]">
                        Open this design in the configurator to inspect it in 3D, continue editing,
                        save a new version, or share it.
                      </p>
                      <a
                        href={`${customer.storefrontOrigin}/products/${selectedDesign.productHandle || 'customgi'}?design=${encodeURIComponent(selectedDesign.id)}`}
                        target="_top"
                        className={`mt-7 inline-flex border border-[#1c1b1b] bg-[#1c1b1b] px-7 py-4 text-white ${label}`}
                      >
                        Open in 3D
                      </a>
                      {uploads.some((upload) => upload.designId === selectedDesign.id) ? (
                        <div className="mt-9 border-t border-[#ddd] pt-6">
                          <h3 className={label}>Artwork in this design</h3>
                          <div className="mt-4 grid grid-cols-3 gap-3">
                            {uploads
                              .filter((upload) => upload.designId === selectedDesign.id)
                              .map((upload, index) => (
                                <a
                                  key={`${upload.url}-${index}`}
                                  href={upload.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="aspect-square border border-[#ddd] bg-[#f7f7f7]"
                                >
                                  <img
                                    src={upload.url}
                                    alt={upload.filename || 'Uploaded artwork'}
                                    className="h-full w-full object-contain p-2"
                                  />
                                </a>
                              ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : designs.length ? (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {designs.map((design) => {
                    const designUrl = new URL(
                      `/products/${design.productHandle || 'customgi'}`,
                      customer.storefrontOrigin,
                    );
                    designUrl.searchParams.set('design', design.id);
                    return (
                      <article key={design.id} className="border border-[#ddd] bg-white">
                        <div className="aspect-square bg-[#f7f7f7]">
                          {design.thumbnailUrl ? (
                            <img
                              src={design.thumbnailUrl}
                              alt={design.name || 'Saved design'}
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <div className={`flex h-full items-center justify-center text-[#999] ${label}`}>
                              Preview pending
                            </div>
                          )}
                        </div>
                        <div className="p-5">
                          <h2 className="text-sm uppercase tracking-[0.12em]">
                            {design.name || 'Saved Design'}
                          </h2>
                          <p className="mt-2 text-xs text-[#777]">
                            Last edited {formatDate(design.updatedAt)}
                          </p>
                          <button
                            type="button"
                            onClick={() => setSelectedDesign(design)}
                            className={`mt-5 inline-flex border border-[#1c1b1b] bg-[#1c1b1b] px-5 py-3 text-white ${label}`}
                          >
                            View design
                          </button>
                          <a
                            href={designUrl.toString()}
                            target="_top"
                            className={`ml-4 mt-5 inline-flex underline underline-offset-4 ${label}`}
                          >
                            Open in 3D
                          </a>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="border border-[#ddd] px-6 py-14 text-center">
                  <p className="text-sm text-[#666]">You haven’t saved a design yet.</p>
                  <a
                    href={`${customer.storefrontOrigin}/products/customgi`}
                    target="_top"
                    className={`mt-6 inline-flex border border-[#1c1b1b] bg-[#1c1b1b] px-7 py-3 text-white ${label}`}
                  >
                    Design a Gi
                  </a>
                </div>
              )}
            </section>
          ) : null}

          {!loading && page === 'uploads' ? (
            <section>
              <p className="mb-6 max-w-2xl text-sm leading-relaxed text-[#666]">
                Artwork uploaded with your saved configurator designs is kept here for reuse and
                production reference.
              </p>
              {uploads.length ? (
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  {uploads.map((upload, index) => (
                    <article key={`${upload.url}-${index}`} className="border border-[#ddd] p-4">
                      <div className="aspect-square bg-[#f7f7f7]">
                        <img
                          src={upload.url}
                          alt={upload.filename || 'Uploaded artwork'}
                          className="h-full w-full object-contain p-3"
                        />
                      </div>
                      <h2 className="mt-4 truncate text-sm">
                        {upload.title || upload.filename || 'Uploaded artwork'}
                      </h2>
                      <p className="mt-1 text-xs text-[#777]">
                        {uploadOrigin(upload)}
                        {upload.slot ? ` · ${upload.slot.replaceAll('-', ' ')}` : ''}
                      </p>
                      <a
                        href={upload.url}
                        target="_blank"
                        rel="noreferrer"
                        className={`mt-4 inline-flex underline underline-offset-4 ${label}`}
                      >
                        Open artwork
                      </a>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="border border-[#ddd] px-6 py-14 text-center text-sm text-[#666]">
                  Uploaded logos from saved designs will appear here.
                </div>
              )}
            </section>
          ) : null}

          {!loading && page === 'fit' ? (
            <form
              className="max-w-4xl"
              onSubmit={(event) => {
                event.preventDefault();
                void saveFit();
              }}
            >
              <p className="mb-7 max-w-2xl text-sm leading-relaxed text-[#666]">
                Save your measurements once so future sizing recommendations and custom orders can
                use the same fit profile.
              </p>
              <div className="mb-6 flex gap-2">
                {(['imperial', 'metric'] as const).map((units) => (
                  <button
                    key={units}
                    type="button"
                    onClick={() => setFit({ ...fit, units })}
                    className={`whitespace-nowrap border px-4 py-2 text-[10px] uppercase tracking-[0.12em] sm:px-5 sm:text-[11px] sm:tracking-[0.16em] ${
                      fit.units === units
                        ? 'border-[#1c1b1b] bg-[#1c1b1b] text-white'
                        : 'border-[#ccc]'
                    }`}
                  >
                    <span className="sm:hidden">
                      {units === 'imperial' ? 'In / Lb' : 'Cm / Kg'}
                    </span>
                    <span className="hidden sm:inline">
                      {units === 'imperial' ? 'Inches / Pounds' : 'Centimeters / Kilograms'}
                    </span>
                  </button>
                ))}
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ['height', 'Height'],
                  ['weight', 'Weight'],
                  ['chest', 'Chest'],
                  ['waist', 'Waist'],
                  ['hips', 'Hips'],
                  ['inseam', 'Inseam'],
                  ['shoulder', 'Shoulder width'],
                  ['sleeve', 'Sleeve length'],
                  ['preferredGiSize', 'Preferred Gi size'],
                ].map(([key, text]) => (
                  <label key={key} className={label}>
                    {text}
                    <input
                      value={String(fit[key as keyof FitProfile] ?? '')}
                      onChange={(event) => setFit({ ...fit, [key]: event.target.value })}
                      className="mt-2 h-11 w-full border border-[#ccc] px-3 text-sm normal-case tracking-normal outline-none focus:border-[#1c1b1b]"
                    />
                  </label>
                ))}
                <label className={label}>
                  Fit preference
                  <select
                    value={fit.fitPreference}
                    onChange={(event) =>
                      setFit({ ...fit, fitPreference: event.target.value as FitProfile['fitPreference'] })
                    }
                    className="mt-2 h-11 w-full border border-[#ccc] bg-white px-3 text-sm normal-case tracking-normal"
                  >
                    <option value="slim">Slim</option>
                    <option value="regular">Regular</option>
                    <option value="relaxed">Relaxed</option>
                  </select>
                </label>
              </div>
              <label className={`mt-5 block ${label}`}>
                Fit notes
                <textarea
                  value={fit.notes}
                  onChange={(event) => setFit({ ...fit, notes: event.target.value })}
                  rows={4}
                  className="mt-2 w-full border border-[#ccc] p-3 text-sm normal-case tracking-normal outline-none focus:border-[#1c1b1b]"
                  placeholder="Examples: longer sleeves, room through shoulders, competition fit…"
                />
              </label>
              <button
                type="submit"
                disabled={savingFit}
                className={`mt-6 border border-[#1c1b1b] bg-[#1c1b1b] px-8 py-3 text-white ${label} disabled:opacity-50`}
              >
                {savingFit ? 'Saving…' : 'Save sizing profile'}
              </button>
              {fit.updatedAt ? (
                <p className="mt-3 text-xs text-[#777]">Last updated {formatDate(fit.updatedAt)}</p>
              ) : null}
            </form>
          ) : null}

          {!loading && page === 'orders' ? (
            <section>
              {selectedOrder ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(null)}
                    className={`${label} mb-8 underline underline-offset-4`}
                  >
                    ← All orders
                  </button>
                  <div className="pt-5">
                    <OrderTimeline order={selectedOrder} />
                  </div>

                  <div className="grid gap-5 pt-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <div>
                      <h3 className={`${label} mb-3 px-1`}>Items</h3>
                      {selectedOrder.items?.length ? (
                        <div className="space-y-4">
                          {selectedOrder.items.map((item, index) => (
                            <article key={`${item.title}-${index}`} className="grid grid-cols-[96px_minmax(0,1fr)_auto] gap-5 rounded-xl border border-[#e5e5e2] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:gap-8 sm:p-7">
                              <div className="h-[150px] bg-white sm:h-[240px]">
                                {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-contain" /> : null}
                              </div>
                              <div>
                                <h4 className="text-sm uppercase tracking-[0.12em]">{cleanOrderTitle(item)}</h4>
                                <p className="mt-1 text-xs text-[#777]">Quantity {item.quantity}</p>
                                <div className="mt-5 space-y-5">
                                  {groupedOrderProperties(item).map(({ group, rows }) => (
                                    <section key={group}>
                                      <h5 className="mb-2 text-[10px] font-medium uppercase tracking-[0.28em]">{group}</h5>
                                      <dl className="space-y-1 text-[11px] uppercase leading-tight text-[#777]">
                                        {rows.map((row, rowIndex) => (
                                          <div key={`${row.label}-${rowIndex}`} className="grid grid-cols-[max-content_minmax(0,1fr)] gap-1">
                                            <dt>{row.label}:</dt>
                                            <dd className="text-[#333]">{row.value}</dd>
                                          </div>
                                        ))}
                                      </dl>
                                    </section>
                                  ))}
                                </div>
                              </div>
                              <div className="text-sm">{formatMoney(item.totalAmount, selectedOrder.totalCurrency)}</div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className="rounded-xl border border-[#e5e5e2] bg-white p-6 text-sm text-[#666]">Item details are not available for this order.</p>
                      )}
                      <div className="mt-4 flex justify-end rounded-xl border border-[#e5e5e2] bg-white p-5 text-base shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                        <span className="mr-10 uppercase tracking-[0.12em]">Total</span>
                        <strong>{formatMoney(selectedOrder.totalAmount, selectedOrder.totalCurrency)}</strong>
                      </div>
                    </div>
                    <aside className="space-y-4 lg:pt-7">
                      <OrderChatPanel customer={customer} order={selectedOrder} />

                      <div className="rounded-xl border border-[#e5e5e2] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                        <h3 className={`${label} mb-3`}>Billing address</h3>
                        <AddressBlock address={selectedOrder.billingAddress} />
                      </div>
                      <div className="rounded-xl border border-[#e5e5e2] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                        <h3 className={`${label} mb-3`}>Shipping address</h3>
                        <AddressBlock address={selectedOrder.shippingAddress} />
                      </div>
                    </aside>
                  </div>
                </div>
              ) : orders.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                    <thead>
                      <tr className={`border-b border-[#1c1b1b] ${label}`}>
                        <th className="w-[104px] py-3 pr-4 font-normal">Product</th>
                        <th className="py-3 pr-4 font-normal">Order</th>
                        <th className="py-3 pr-4 font-normal">Date</th>
                        <th className="py-3 pr-4 font-normal">Payment</th>
                        <th className="py-3 pr-4 font-normal">Fulfillment</th>
                        <th className="py-3 font-normal">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => (
                        <tr key={order.id} className="border-b border-[#ddd]">
                          <td className="py-4 pr-4">
                            <button
                              type="button"
                              onClick={() => setSelectedOrder(order)}
                              aria-label={`Open order ${order.name}`}
                              className="flex h-24 w-20 items-center justify-center bg-white"
                            >
                              {order.items?.[0]?.imageUrl ? (
                                <img
                                  src={order.items[0].imageUrl}
                                  alt={`${cleanOrderTitle(order.items[0])} design`}
                                  className="h-full w-full object-contain"
                                />
                              ) : (
                                <span className="text-[9px] uppercase tracking-[0.12em] text-[#999]">No preview</span>
                              )}
                            </button>
                          </td>
                          <td className="py-4 pr-4">
                            <button type="button" onClick={() => setSelectedOrder(order)} className="underline">
                              {order.name}
                            </button>
                            <span className="mt-1 block text-[11px] text-[#777]">
                              {ORDER_STAGES[orderProgress(order).index]}
                            </span>
                          </td>
                          <td className="py-4 pr-4">{formatDate(order.processedAt)}</td>
                          <td className="py-4 pr-4"><StatusBadge value={order.financialStatus} /></td>
                          <td className="py-4 pr-4"><StatusBadge value={order.fulfillmentStatus} /></td>
                          <td className="py-4">
                            {formatMoney(order.totalAmount, order.totalCurrency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="border border-[#ddd] px-6 py-14 text-center">
                  <p className="text-sm text-[#666]">You haven’t placed any orders yet.</p>
                  <a
                    href={`${customer.storefrontOrigin}/collections/all`}
                    target="_top"
                    className={`mt-6 inline-flex border border-[#1c1b1b] bg-[#1c1b1b] px-7 py-3 text-white ${label}`}
                  >
                    Start shopping
                  </a>
                </div>
              )}
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
