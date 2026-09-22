import { getAuth } from '../lib/auth.mjs';
import {
  CHANNELS, academyStore, clean, cleanBrandColors, cleanShopDomain, slugify, summarizeAcademy, writeProfile,
} from '../lib/academy.mjs';

// /api/academy — the signed-in member's academy.
//
//   GET    -> { academy } (null when they have none)
//   POST   -> create it: { name, logo?, brandColors? }. The creator becomes
//             its owner and the session switches into it.
//   PATCH  -> owner/admin edits name, logo, brand colors, and answers
//             "Where will you sell?" ({ channel, shopDomain }).
//
// The plan and card go through Better Auth's Stripe plugin (/api/auth/
// subscription/*), not here; the summary just reports what it finds there.

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });

const isHttpUrl = (value) => /^https:\/\/\S+$/i.test(value);

async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

export default async (request) => {
  let auth;
  try {
    auth = getAuth();
  } catch (error) {
    console.error('[academy] auth not configured', error);
    return json({ error: 'Accounts are not configured on this deploy.' }, 503);
  }

  const headers = request.headers;
  const session = await auth.api.getSession({ headers }).catch(() => null);
  if (!session?.user) return json({ error: 'Sign in to continue.' }, 401);

  const store = academyStore();

  if (request.method === 'GET') {
    const academy = await summarizeAcademy({ auth, headers, session, store });
    return json({ data: { academy } });
  }

  if (request.method === 'POST') {
    const existing = await summarizeAcademy({ auth, headers, session, store });
    if (existing) return json({ error: 'You already have an academy.', data: { academy: existing } }, 409);

    const body = await readBody(request);
    const name = clean(body.name, 120);
    if (name.length < 2) return json({ error: 'Give your academy a name.' }, 400);
    const logo = clean(body.logo, 500);
    if (logo && !isHttpUrl(logo)) return json({ error: 'The logo must be an uploaded image.' }, 400);
    const brandColors = cleanBrandColors(body.brandColors);

    // Slugs are unique across academies; the suffix keeps forty "Gracie
    // Barra"s from fighting over one slug while a human-readable prefix
    // survives for URLs later.
    const slug = `${slugify(name) || 'academy'}-${Math.random().toString(36).slice(2, 8)}`;

    let organization;
    try {
      organization = await auth.api.createOrganization({
        headers,
        body: { name, slug, ...(logo ? { logo } : {}) },
      });
    } catch (error) {
      console.error('[academy] could not create the organization', error);
      const message = error?.body?.message || error?.message || 'Could not create your academy.';
      return json({ error: message }, Number(error?.statusCode) || 500);
    }
    if (!organization?.id) return json({ error: 'Could not create your academy.' }, 500);

    await writeProfile(store, organization.id, {
      name,
      logo: logo || null,
      brandColors,
      ownerUserId: session.user.id,
    });

    const academy = await summarizeAcademy({ auth, headers, session, store });
    return json({ data: { academy: academy ?? { id: organization.id, name, slug, logo: logo || null, brandColors, role: 'owner', memberCount: 1, plan: null } } }, 201);
  }

  if (request.method === 'PATCH') {
    const current = await summarizeAcademy({ auth, headers, session, store });
    if (!current) return json({ error: 'You do not have an academy yet.' }, 404);
    if (!['owner', 'admin'].includes(current.role)) {
      return json({ error: 'Only academy owners and admins can edit the academy.' }, 403);
    }

    const body = await readBody(request);
    const data = {};
    if (body.name !== undefined) {
      const name = clean(body.name, 120);
      if (name.length < 2) return json({ error: 'Give your academy a name.' }, 400);
      data.name = name;
    }
    if (body.logo !== undefined) {
      const logo = clean(body.logo, 500);
      if (logo && !isHttpUrl(logo)) return json({ error: 'The logo must be an uploaded image.' }, 400);
      data.logo = logo || null;
    }

    if (Object.keys(data).length) {
      try {
        await auth.api.updateOrganization({ headers, body: { organizationId: current.id, data } });
      } catch (error) {
        console.error('[academy] could not update the organization', error);
        return json({ error: error?.body?.message || 'Could not save your academy.' }, Number(error?.statusCode) || 500);
      }
    }

    const patch = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.logo !== undefined) patch.logo = data.logo;
    if (body.brandColors !== undefined) patch.brandColors = cleanBrandColors(body.brandColors);

    // "Where will you sell?" — onboarding step 3. Skippable, and re-answerable.
    if (body.channel !== undefined) {
      const channel = body.channel === null ? null : clean(body.channel, 40);
      if (channel !== null && !CHANNELS.includes(channel)) return json({ error: 'Pick a store type.' }, 400);
      patch.channel = channel;
      if (channel === 'hosted-site') patch.hostedSiteInterest = true;
      patch.channelChosenAt = new Date().toISOString();
    }
    if (body.shopDomain !== undefined) {
      const raw = clean(body.shopDomain, 200);
      const shopDomain = raw ? cleanShopDomain(raw) : '';
      if (raw && !shopDomain) return json({ error: 'That does not look like a myshopify.com address.' }, 400);
      patch.shopDomain = shopDomain || null;
    }
    if (Object.keys(patch).length) await writeProfile(store, current.id, patch);

    const academy = await summarizeAcademy({ auth, headers, session, store });
    return json({ data: { academy } });
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/academy' };
