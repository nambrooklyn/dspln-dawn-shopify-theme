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

export interface AcademySummary {
  id: string;
  name: string;
  slug: string | null;
  logo: string | null;
  brandColors: AcademyBrandColors;
  role: string;
  memberCount: number;
  /** Not set until the plan picker lands (Phase 1, next slice). */
  plan: string | null;
  createdAt?: string | null;
}

export interface CreateAcademyInput {
  name: string;
  logo?: string;
  brandColors?: AcademyBrandColors;
}

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
export const updateAcademy = (input: Partial<CreateAcademyInput>) => academyRequest('PATCH', { ...input });

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
