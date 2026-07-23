import { getStore } from '@netlify/blobs';

const STORE_NAME = 'dspln-customer-fit';
const OWNER_PATTERN = /^shopify:[a-z0-9.-]+:\d+$/i;
const MAX_TEXT = 500;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });

const clean = (value, max = 80) => String(value ?? '').trim().slice(0, max);

const normalizeProfile = (input = {}) => ({
  units: input.units === 'metric' ? 'metric' : 'imperial',
  height: clean(input.height),
  weight: clean(input.weight),
  chest: clean(input.chest),
  waist: clean(input.waist),
  hips: clean(input.hips),
  inseam: clean(input.inseam),
  shoulder: clean(input.shoulder),
  sleeve: clean(input.sleeve),
  preferredGiSize: clean(input.preferredGiSize),
  fitPreference: ['slim', 'regular', 'relaxed'].includes(input.fitPreference)
    ? input.fitPreference
    : 'regular',
  notes: clean(input.notes, MAX_TEXT),
  updatedAt: new Date().toISOString(),
});

const keyFor = (ownerKey) => `fit/${encodeURIComponent(ownerKey)}`;

export default async (request) => {
  if (!['GET', 'PUT'].includes(request.method)) {
    return json({ error: 'Method not allowed' }, 405);
  }

  const store = getStore({ name: STORE_NAME, consistency: 'strong' });

  if (request.method === 'GET') {
    const ownerKey = new URL(request.url).searchParams.get('ownerKey') ?? '';
    if (!OWNER_PATTERN.test(ownerKey)) return json({ error: 'Invalid customer identity' }, 400);
    const profile = await store.get(keyFor(ownerKey), { type: 'json' });
    return profile ? json({ data: { profile } }) : json({ error: 'No sizing profile' }, 404);
  }

  const body = await request.json().catch(() => ({}));
  const ownerKey = String(body.ownerKey ?? '');
  if (!OWNER_PATTERN.test(ownerKey)) return json({ error: 'Invalid customer identity' }, 400);
  const profile = normalizeProfile(body.profile);
  await store.setJSON(keyFor(ownerKey), profile);
  return json({ data: { profile } });
};

export const config = {
  path: '/api/customer-fit',
};
