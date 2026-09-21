import { getStore } from '@netlify/blobs';

import { ACADEMY_PLANS, configuredPlans, stripeIsConfigured } from './academy-plans.mjs';

// An academy is a Better Auth organization (see auth.mjs, where the plugin is
// enabled) plus a small profile DSPLN keeps beside it: brand colors and, later,
// the plan, the connected store and the card on file.
//
// The profile lives in a blob rather than in the organization's `metadata`
// column on purpose. That column is jsonb in platform.organization, while the
// plugin stringifies metadata on the way in and only parses it back when it
// reads a string — a jsonb round-trip could hand it an object and break every
// organization read. Nothing about an academy needs to be in that column.

const STORE_NAME = 'dspln-academies';

export const ACADEMY_ROLES = ['owner', 'admin', 'member'];

// Where the academy sells. Shopify is the first real channel (Phase 2 wires
// the OAuth connect); the hosted site is recorded as interest so demand is
// known before it is built.
export const CHANNELS = ['shopify', 'hosted-site'];
const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/** "brooklyn-bjj.myshopify.com" from whatever the academy typed. */
export function cleanShopDomain(input) {
  let value = clean(input, 200).toLowerCase();
  value = value.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (value && !value.includes('.')) value = `${value}.myshopify.com`;
  return SHOP_DOMAIN.test(value) ? value : '';
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export const clean = (value, max = 180) => String(value ?? '').trim().slice(0, max);

export function slugify(name) {
  return String(name ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}

/** Keep only well-formed hex colors; drop anything else silently. */
export function cleanBrandColors(input) {
  const colors = {};
  for (const key of ['primary', 'secondary', 'accent']) {
    const value = clean(input?.[key], 7);
    if (HEX.test(value)) colors[key] = value.toLowerCase();
  }
  return colors;
}

export function academyStore(context) {
  const production = context?.deploy?.context === 'production';
  return getStore({ name: production ? STORE_NAME : `${STORE_NAME}-dev`, consistency: 'strong' });
}

const profileKey = (organizationId) => `academies/${encodeURIComponent(organizationId)}.json`;

export async function readProfile(store, organizationId) {
  try {
    return (await store.get(profileKey(organizationId), { type: 'json' })) ?? {};
  } catch {
    return {};
  }
}

export async function writeProfile(store, organizationId, patch) {
  const current = await readProfile(store, organizationId);
  const now = new Date().toISOString();
  const next = { ...current, ...patch, organizationId, createdAt: current.createdAt ?? now, updatedAt: now };
  await store.setJSON(profileKey(organizationId), next);
  return next;
}

/**
 * The academy this session is acting for, or null for a retail member.
 *
 * A member of exactly one academy who has no active organization yet (the
 * session predates the academy, or was opened on another device) is switched
 * into it here, so "signed in" and "in Academy mode" never drift apart.
 */
export async function summarizeAcademy({ auth, headers, session, store }) {
  if (!session?.user) return null;

  let organizationId = session.session?.activeOrganizationId ?? null;

  if (!organizationId) {
    const memberships = await auth.api.listOrganizations({ headers }).catch(() => []);
    if (!Array.isArray(memberships) || memberships.length === 0) return null;
    organizationId = memberships[0].id;
    await auth.api
      .setActiveOrganization({ headers, body: { organizationId } })
      .catch((error) => console.error('[academy] could not set the active organization', error));
  }

  const organization = await auth.api
    .getFullOrganization({ headers, query: { organizationId } })
    .catch((error) => {
      console.error('[academy] could not read the organization', error);
      return null;
    });
  if (!organization) return null;

  const me = (organization.members ?? []).find((member) => member.userId === session.user.id);
  const profile = store ? await readProfile(store, organization.id) : {};
  const subscription = await readSubscription({ auth, headers, organizationId: organization.id });

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug ?? null,
    logo: organization.logo ?? profile.logo ?? null,
    brandColors: profile.brandColors ?? {},
    role: me?.role ?? 'member',
    memberCount: (organization.members ?? []).length,
    plan: subscription?.plan ?? null,
    subscription,
    entitlements: entitlementsFor(subscription?.plan),
    // Billing is only offered once Stripe is configured on this deploy.
    billingAvailable: stripeIsConfigured() && configuredPlans().length > 0,
    channel: CHANNELS.includes(profile.channel) ? profile.channel : null,
    shopDomain: profile.shopDomain ?? null,
    hostedSiteInterest: Boolean(profile.hostedSiteInterest),
    createdAt: organization.createdAt ?? null,
  };
}

/** What the plan lets the academy do; null until they have one. */
export function entitlementsFor(plan) {
  return ACADEMY_PLANS.find((entry) => entry.name === plan)?.limits ?? null;
}

/**
 * The academy's active (or trialing) subscription from the Stripe plugin's
 * table, trimmed to what the Locker shows. Absent when billing is not
 * configured on this deploy, or the academy has not picked a plan.
 */
async function readSubscription({ auth, headers, organizationId }) {
  if (typeof auth.api.listActiveSubscriptions !== 'function') return null;
  try {
    const list = await auth.api.listActiveSubscriptions({
      headers,
      query: { customerType: 'organization', referenceId: organizationId },
    });
    const current = Array.isArray(list) ? list[0] : null;
    if (!current) return null;
    return {
      plan: current.plan,
      status: current.status,
      periodEnd: current.periodEnd ? new Date(current.periodEnd).toISOString() : null,
      cancelAtPeriodEnd: Boolean(current.cancelAtPeriodEnd),
      trialEnd: current.trialEnd ? new Date(current.trialEnd).toISOString() : null,
      stripeSubscriptionId: current.stripeSubscriptionId ?? null,
    };
  } catch (error) {
    console.error('[academy] could not read the subscription', error);
    return null;
  }
}
