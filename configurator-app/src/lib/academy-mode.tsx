/**
 * Academy mode — the Locker's B2B side.
 *
 * An academy is a Better Auth organization the signed-in member belongs to.
 * When the session has one, the Locker grows Academy tabs and the
 * configurators offer "Publish Product" where a retail customer sees "Add to
 * Cart". Everything else (configurators, saved designs, the order thread) is
 * shared — B2B is a mode of the Locker, not a second app.
 */

import { useEffect, useState } from 'react';

export interface AcademyBrandColors {
  primary?: string;
  secondary?: string;
  accent?: string;
}

export type AcademyPlanId = 'academy/starter' | 'academy/custom' | 'academy/private-label';

export interface AcademyEntitlements {
  logoOnlyProducts: boolean;
  customConfigurator: boolean;
  privateLabelBranding: boolean;
  shopifyPublishing: boolean;
}

export interface AcademySubscription {
  plan: string;
  status: string;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
  stripeSubscriptionId: string | null;
}

export type AcademyChannel = 'shopify' | 'hosted-site';

export interface AcademySummary {
  id: string;
  name: string;
  slug: string | null;
  logo: string | null;
  brandColors: AcademyBrandColors;
  role: string;
  memberCount: number;
  /** The plan id (see ACADEMY_PLANS) once a subscription is active. */
  plan: string | null;
  subscription: AcademySubscription | null;
  entitlements: AcademyEntitlements | null;
  /** False on a deploy without Stripe keys — the Billing tab says so. */
  billingAvailable: boolean;
  channel: AcademyChannel | null;
  shopDomain: string | null;
  hostedSiteInterest: boolean;
  createdAt?: string | null;
}

export interface CreateAcademyInput {
  name: string;
  logo?: string;
  brandColors?: AcademyBrandColors;
}

export interface UpdateAcademyInput extends Partial<CreateAcademyInput> {
  channel?: AcademyChannel | null;
  shopDomain?: string | null;
}

/**
 * The plans as the Billing tab draws them. Ids match the server's
 * academy-plans.mjs; prices are display copy — Stripe holds the real ones.
 */
export const ACADEMY_PLANS: Array<{
  id: AcademyPlanId;
  name: string;
  tagline: string;
  price: string;
  blurb: string;
  features: string[];
}> = [
  {
    id: 'academy/starter',
    name: 'Starter',
    tagline: 'Logo It',
    price: '$49',
    blurb: 'Your logo on DSPLN’s proven designs.',
    features: ['Logo placement on every product', 'Publish to your Shopify store', 'DSPLN makes, ships and handles support'],
  },
  {
    id: 'academy/custom',
    name: 'Custom',
    tagline: 'Customize It',
    price: '$89',
    blurb: 'The full 3D configurator, every part yours.',
    features: ['Everything in Starter', 'Full colorways, panels and artwork', 'Unlimited saved designs'],
  },
  {
    id: 'academy/private-label',
    name: 'Private Label',
    tagline: 'Brand It',
    price: '$199',
    blurb: 'Your brand on the label, the tag and the bag.',
    features: ['Everything in Custom', 'Private-label branding on the garment', 'Priority production slots'],
  },
];

export const planById = (id: string | null | undefined) => ACADEMY_PLANS.find((plan) => plan.id === id) ?? null;

async function academyRequest(
  method: 'GET' | 'POST' | 'PATCH',
  body?: Record<string, unknown>,
): Promise<AcademySummary | null> {
  const response = await fetch(new URL('/api/academy', window.location.origin), {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || 'That did not work. Try again.');
  }
  return (payload?.data?.academy as AcademySummary | null) ?? null;
}

export const fetchAcademy = () => academyRequest('GET');
export const createAcademy = (input: CreateAcademyInput) => academyRequest('POST', { ...input });
export const updateAcademy = (input: UpdateAcademyInput) => academyRequest('PATCH', { ...input });

/* ---------------------------------------------------------------------- */
/* Billing — Better Auth's Stripe plugin, subscription owned by the academy */
/* ---------------------------------------------------------------------- */

async function subscriptionRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(new URL(`/api/auth/subscription/${path}`, window.location.origin), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error?.message || 'That did not work. Try again.');
  }
  return payload as T;
}

/** Where Stripe sends the academy back to: the Billing tab, or the sign-up page mid-flow. */
function billingReturnUrl(extra: Record<string, string> = {}, returnTo = '/locker?page=billing'): string {
  const url = new URL(returnTo, window.location.origin);
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  return url.toString();
}

/**
 * Start Stripe Checkout for a plan. Resolves to the Checkout URL; the caller
 * navigates. A plan change on an existing subscription is applied in place
 * and resolves to null (nothing to navigate to).
 */
export async function startPlanCheckout(
  academyId: string,
  plan: AcademyPlanId,
  returnTo?: string,
): Promise<string | null> {
  const result = await subscriptionRequest<{ url?: string | null; redirect?: boolean }>('upgrade', {
    plan,
    customerType: 'organization',
    referenceId: academyId,
    successUrl: billingReturnUrl({ checkout: 'success' }, returnTo),
    cancelUrl: billingReturnUrl({ checkout: 'cancelled' }, returnTo),
    returnUrl: billingReturnUrl({}, returnTo),
    disableRedirect: true,
  });
  return result.url ?? null;
}

/** Stripe's hosted portal: change card, download invoices, cancel. */
export async function openBillingPortal(academyId: string): Promise<string> {
  const result = await subscriptionRequest<{ url: string }>('billing-portal', {
    customerType: 'organization',
    referenceId: academyId,
    returnUrl: billingReturnUrl(),
  });
  return result.url;
}

/**
 * One session lookup per page load, shared by every configurator component
 * that draws the primary button. Configurators are embedded on dspln.com
 * from this origin, so the Locker's session cookie travels with the call.
 */
let sessionAcademy: Promise<AcademySummary | null> | null = null;

function loadSessionAcademy(): Promise<AcademySummary | null> {
  if (sessionAcademy) return sessionAcademy;
  if (typeof window === 'undefined') return Promise.resolve(null);
  sessionAcademy = fetch(new URL('/api/locker-session', window.location.origin), {
    credentials: 'include',
  })
    .then(async (response) => {
      if (!response.ok) return null;
      const session = (await response.json()) as { signedIn?: boolean; academy?: AcademySummary | null };
      return session.signedIn && session.academy ? session.academy : null;
    })
    .catch(() => null);
  return sessionAcademy;
}

/** Forget the cached lookup — call after creating or leaving an academy. */
export function resetAcademyMode() {
  sessionAcademy = null;
}

export function useAcademyMode(): AcademySummary | null {
  const [academy, setAcademy] = useState<AcademySummary | null>(null);
  useEffect(() => {
    let live = true;
    void loadSessionAcademy().then((value) => { if (live) setAcademy(value); });
    return () => { live = false; };
  }, []);
  return academy;
}

export const PUBLISH_LABEL = 'Publish Product';
export const PUBLISH_LOADING_LABEL = 'Publishing…';

/**
 * The configurator's primary action, by mode. Only the stock retail label is
 * swapped: "Update Cart" (editing a cart line) stays what it is, and a caller
 * that passed its own label meant it.
 */
export function academyCartActionLabel(label: string, academy: AcademySummary | null): string {
  if (!academy) return label;
  if (label === 'Add to Cart') return PUBLISH_LABEL;
  // The rashguard phone flows shorten the label to fit the bar.
  if (label === 'Add') return 'Publish';
  return label;
}

/**
 * Drop-in for the button text in every configurator: renders "Publish
 * Product" in Academy mode and the given label otherwise. A component rather
 * than a hook so the twenty-odd sidebars, drawers and top bars that draw this
 * button need a one-token change, not a hook call each.
 */
export function CartActionLabel({ label }: { label: string }) {
  const academy = useAcademyMode();
  return <>{academyCartActionLabel(label, academy)}</>;
}
