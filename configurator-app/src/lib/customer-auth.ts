/**
 * Shopify Customer Account API authentication (OAuth 2.0 authorization
 * code + PKCE, public client — no secret ever ships to the browser).
 *
 * Endpoints verified against the dev store's discovery documents:
 *   https://{shop-domain}/.well-known/openid-configuration
 *   https://{shop-domain}/.well-known/customer-account-api
 *
 * The client ID comes from the Headless channel's Customer Account API
 * settings in Shopify admin. It is not a secret, but it is per-store:
 *   - build-time: VITE_SHOPIFY_CUSTOMER_CLIENT_ID / VITE_SHOPIFY_SHOP_ID
 *   - runtime override (handy on branch deploys before Netlify env is
 *     set): localStorage 'dspln:portal:client-id' / 'dspln:portal:shop-id'
 */

const DEFAULT_SHOP_ID = '71435092012'; // dspln-dev-2

const runtimeOverride = (key: string): string | undefined => {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
};

export const shopId = (): string =>
  runtimeOverride('dspln:portal:shop-id') ||
  (import.meta.env.VITE_SHOPIFY_SHOP_ID as string | undefined) ||
  DEFAULT_SHOP_ID;

export const clientId = (): string =>
  runtimeOverride('dspln:portal:client-id') ||
  (import.meta.env.VITE_SHOPIFY_CUSTOMER_CLIENT_ID as string | undefined) ||
  '';

const authBase = () => `https://shopify.com/authentication/${shopId()}`;
const API_VERSION = '2026-07';

export const graphqlEndpoint = (): string =>
  `https://shopify.com/${shopId()}/account/customer/api/${API_VERSION}/graphql`;

const TOKENS_KEY = 'dspln:portal:tokens';
const VERIFIER_KEY = 'dspln:portal:verifier';
const STATE_KEY = 'dspln:portal:state';

interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number; // epoch ms
}

const redirectUri = () => `${window.location.origin}/portal/callback`;

const randomString = (length: number): string => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ('0' + (b & 0xff).toString(16)).slice(-2))
    .join('')
    .slice(0, length);
};

const base64UrlEncode = (bytes: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const codeChallenge = async (verifier: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return base64UrlEncode(digest);
};

const readTokens = (): StoredTokens | null => {
  try {
    const raw = window.localStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as StoredTokens) : null;
  } catch {
    return null;
  }
};

const writeTokens = (tokens: StoredTokens | null) => {
  if (tokens) window.localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  else window.localStorage.removeItem(TOKENS_KEY);
};

export const isConfigured = (): boolean => clientId().length > 0;

export const isLoggedIn = (): boolean => readTokens() !== null;

export async function beginLogin(): Promise<void> {
  const verifier = randomString(96);
  const state = randomString(32);
  window.sessionStorage.setItem(VERIFIER_KEY, verifier);
  window.sessionStorage.setItem(STATE_KEY, state);

  const url = new URL(`${authBase()}/oauth/authorize`);
  url.searchParams.set('scope', 'openid email customer-account-api:full');
  url.searchParams.set('client_id', clientId());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', redirectUri());
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', randomString(24));
  url.searchParams.set('code_challenge', await codeChallenge(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  window.location.href = url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<StoredTokens> {
  const response = await fetch(`${authBase()}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const data = (await response.json()) as TokenResponse;
  if (!response.ok || data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || `Token request failed (${response.status})`);
  }
  const previous = readTokens();
  const tokens: StoredTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? previous?.refreshToken,
    idToken: data.id_token ?? previous?.idToken,
    // refresh one minute before actual expiry
    expiresAt: Date.now() + Math.max(0, data.expires_in - 60) * 1000,
  };
  writeTokens(tokens);
  return tokens;
}

/** Handle /portal/callback. Returns true when a code was exchanged. */
export async function completeLogin(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return false;
  const expectedState = window.sessionStorage.getItem(STATE_KEY);
  if (expectedState && params.get('state') !== expectedState) {
    throw new Error('Login state mismatch — please try signing in again.');
  }
  const verifier = window.sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error('Missing login verifier — please try signing in again.');
  await tokenRequest({
    grant_type: 'authorization_code',
    client_id: clientId(),
    redirect_uri: redirectUri(),
    code,
    code_verifier: verifier,
  });
  window.sessionStorage.removeItem(VERIFIER_KEY);
  window.sessionStorage.removeItem(STATE_KEY);
  return true;
}

/** Valid access token, refreshing when close to expiry. Null = logged out. */
export async function getAccessToken(): Promise<string | null> {
  const tokens = readTokens();
  if (!tokens) return null;
  if (Date.now() < tokens.expiresAt) return tokens.accessToken;
  if (!tokens.refreshToken) {
    writeTokens(null);
    return null;
  }
  try {
    const refreshed = await tokenRequest({
      grant_type: 'refresh_token',
      client_id: clientId(),
      refresh_token: tokens.refreshToken,
    });
    return refreshed.accessToken;
  } catch {
    writeTokens(null);
    return null;
  }
}

export function logout(): void {
  const tokens = readTokens();
  writeTokens(null);
  const url = new URL(`${authBase()}/logout`);
  if (tokens?.idToken) url.searchParams.set('id_token_hint', tokens.idToken);
  url.searchParams.set('post_logout_redirect_uri', `${window.location.origin}/portal`);
  window.location.href = url.toString();
}
