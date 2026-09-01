import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

import { getStore } from '@netlify/blobs';

// Shopify OAuth, so DSPLN holds an Admin API token of its own.
//
// Shopify retired the "copy your Admin API token" screen for this store —
// tokens now reach an app only through OAuth. These two routes are that
// backend: /api/shopify/install starts the grant, /api/shopify/callback
// receives the code and trades it for a permanent offline token.
//
// The token is stored in blobs rather than an env var because it is minted
// here at runtime; env vars are for secrets a human pastes. Readers should
// prefer the stored token and fall back to SHOPIFY_ADMIN_TOKEN, so an
// existing manual token keeps working.

const STORE_NAME = 'dspln-shopify-auth';
const TOKEN_KEY = 'admin-token.json';
const STATE_PREFIX = 'oauth-state/';
const SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN || 'f39242.myshopify.com';
const SCOPES = 'read_customers,write_customers';
const STATE_TTL_MS = 10 * 60 * 1000;

const html = (body, status = 200) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><title>DSPLN</title>
     <body style="font-family:system-ui;max-width:34rem;margin:15vh auto;padding:0 1.5rem;line-height:1.6">${body}</body>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );

/** Shopify signs every callback; an unverified code is not worth trading. */
function verifyHmac(url, secret) {
  const params = new URLSearchParams(url.search);
  const received = params.get('hmac') ?? '';
  params.delete('hmac');
  params.delete('signature');
  const message = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  const expected = createHmac('sha256', secret).update(message).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Only ever talk to our own shop, never one named in a query string. */
const shopIsOurs = (shop) => shop === SHOP_DOMAIN;

export default async (request) => {
  const url = new URL(request.url);
  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  const adminKey = process.env.DSPLN_ADMIN_API_KEY;
  const store = getStore({ name: STORE_NAME, consistency: 'strong' });

  if (!apiKey || !apiSecret) {
    return html('<h1>Not configured</h1><p>SHOPIFY_API_KEY and SHOPIFY_API_SECRET must be set.</p>', 500);
  }

  // ---- start the grant -------------------------------------------------
  if (url.pathname.endsWith('/install')) {
    // Installing is an admin act, not something a passer-by should trigger.
    if (!adminKey || url.searchParams.get('key') !== adminKey) {
      return html('<h1>Not found</h1>', 404);
    }
    const state = randomBytes(16).toString('hex');
    await store.setJSON(`${STATE_PREFIX}${state}`, { createdAt: Date.now() });
    const redirectUri = `${url.origin}/api/shopify/callback`;
    const authorize = new URL(`https://${SHOP_DOMAIN}/admin/oauth/authorize`);
    authorize.searchParams.set('client_id', apiKey);
    authorize.searchParams.set('scope', SCOPES);
    authorize.searchParams.set('redirect_uri', redirectUri);
    authorize.searchParams.set('state', state);
    // Offline: a token tied to the shop, not to whoever happened to click.
    authorize.searchParams.set('grant_options[]', '');
    return Response.redirect(authorize.toString(), 302);
  }

  // ---- receive the grant ----------------------------------------------
  if (url.pathname.endsWith('/callback')) {
    const shop = url.searchParams.get('shop') ?? '';
    const code = url.searchParams.get('code') ?? '';
    const state = url.searchParams.get('state') ?? '';

    if (!shopIsOurs(shop)) return html('<h1>Unexpected shop</h1>', 400);
    if (!verifyHmac(url, apiSecret)) return html('<h1>Signature check failed</h1>', 400);

    const stored = await store.get(`${STATE_PREFIX}${state}`, { type: 'json' });
    if (!stored || Date.now() - stored.createdAt > STATE_TTL_MS) {
      return html('<h1>That link has expired</h1><p>Start the install again.</p>', 400);
    }
    await store.delete(`${STATE_PREFIX}${state}`);

    const exchange = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: apiKey, client_secret: apiSecret, code }),
    });
    const payload = await exchange.json().catch(() => null);
    if (!exchange.ok || !payload?.access_token) {
      console.error('[shopify-oauth] exchange failed', exchange.status, payload);
      return html('<h1>Could not complete the install</h1>', 502);
    }

    await store.setJSON(TOKEN_KEY, {
      accessToken: payload.access_token,
      scope: payload.scope ?? SCOPES,
      shop,
      obtainedAt: new Date().toISOString(),
    });

    return html(
      `<h1>DSPLN is connected to Shopify</h1>
       <p>Scopes granted: <code>${payload.scope ?? SCOPES}</code></p>
       <p>You can close this tab.</p>`,
    );
  }

  return html('<h1>Not found</h1>', 404);
};

export const config = { path: '/api/shopify/*' };
