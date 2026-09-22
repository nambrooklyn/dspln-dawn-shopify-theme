import pg from 'pg';

import { ACADEMY_PLANS, configuredPlans, stripeIsConfigured } from './academy-plans.mjs';

// An academy is a Better Auth organization (see auth.mjs, where the plugin is
// enabled) plus a small profile DSPLN keeps beside it: logo, brand colors, and
// where the academy sells.
//
// The profile lives in platform.academy_profile (migration 0004), not in the
// organization's own `metadata` column: that column is jsonb, while the plugin
// stringifies metadata on the way in and only parses it back when it reads a
// string, so a jsonb round-trip could break every organization read.
//
// It also does not live in a Netlify blob, which is where it started. The two
// functions that read it disagreed about which blob store they were in — one
// is a v1 lambda-compat function, the other v2 — so the Locker's session read
// an empty profile for an academy the API had just written to. Every function
// already reaches this database reliably; that is why the profile is here.

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

// Nano compute allows 15 pooled connections across every function sharing
// this database, so this one stays small on purpose (see auth.mjs).
let pool = null;
function getPool() {
  if (pool) return pool;
  if (!process.env.DATABASE_URL) return null;
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 10_000,
    options: '-c search_path=platform',
  });
  return pool;
}

const emptyProfile = {};

/** The academy's profile row, or {} when it has none yet. */
export async function readProfile(organizationId) {
  const db = getPool();
  if (!db) return emptyProfile;
  try {
    const { rows } = await db.query(
      `select logo, brand_colors, channel, shop_domain, hosted_site_interest, selected_plan
         from academy_profile where organization_id = $1`,
      [organizationId],
    );
    const row = rows[0];
    if (!row) return emptyProfile;
    return {
      logo: row.logo ?? null,
      brandColors: row.brand_colors ?? {},
      channel: row.channel ?? null,
      shopDomain: row.shop_domain ?? null,
      hostedSiteInterest: Boolean(row.hosted_site_interest),
      selectedPlan: row.selected_plan ?? null,
    };
  } catch (error) {
    // A profile that cannot be read must not cost the academy its session —
    // they simply see the defaults until the next read succeeds.
    console.error('[academy] could not read the profile', error);
    return emptyProfile;
  }
}

/** Insert or update only the fields in `patch`; anything absent is untouched. */
export async function writeProfile(organizationId, patch) {
  const db = getPool();
  if (!db) throw new Error('DATABASE_URL is not configured');

  const columns = {
    logo: 'logo',
    brandColors: 'brand_colors',
    channel: 'channel',
    shopDomain: 'shop_domain',
    hostedSiteInterest: 'hosted_site_interest',
    channelChosenAt: 'channel_chosen_at',
    selectedPlan: 'selected_plan',
    selectedPlanAt: 'selected_plan_at',
    ownerUserId: 'owner_user_id',
  };

  const names = ['organization_id'];
  const values = [organizationId];
  for (const [key, column] of Object.entries(columns)) {
    if (patch[key] === undefined) continue;
    names.push(column);
    values.push(key === 'brandColors' ? JSON.stringify(patch[key] ?? {}) : patch[key]);
  }

  const placeholders = values.map((_, index) => `$${index + 1}`);
  // Everything but organization_id is updated on conflict, so a second write
  // edits the row rather than failing on the primary key.
  const updates = names
    .slice(1)
    .map((column) => `${column} = excluded.${column}`)
    .concat('updated_at = now()')
    .join(', ');

  await db.query(
    `insert into academy_profile (${names.join(', ')}) values (${placeholders.join(', ')})
       on conflict (organization_id) do update set ${updates}`,
    values,
  );

  return readProfile(organizationId);
}

/**
 * The academy this session is acting for, or null for a retail member.
 *
 * A member of exactly one academy who has no active organization yet (the
 * session predates the academy, or was opened on another device) is switched
 * into it here, so "signed in" and "in Academy mode" never drift apart.
 */
export async function summarizeAcademy({ auth, headers, session }) {
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
  const profile = await readProfile(organization.id);
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
    // What they picked at the plan step. On production the subscription is
    // what counts; this is how a deploy without Stripe remembers the choice.
    selectedPlan: profile.selectedPlan ?? null,
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
