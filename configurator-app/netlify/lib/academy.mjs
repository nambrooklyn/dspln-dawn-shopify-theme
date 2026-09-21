import { getStore } from '@netlify/blobs';

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

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug ?? null,
    logo: organization.logo ?? profile.logo ?? null,
    brandColors: profile.brandColors ?? {},
    role: me?.role ?? 'member',
    memberCount: (organization.members ?? []).length,
    // Not wired yet — Phase 1 adds Stripe and the plan picker after this slice.
    plan: profile.plan ?? null,
    createdAt: organization.createdAt ?? null,
  };
}
