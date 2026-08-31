import { getAuth } from '../lib/auth.mjs';

// DSPLN's identity endpoint: everything Better Auth serves under /api/auth/*
// — sign-up, sign-in, sign-out, session, password reset, and the social
// callbacks once provider credentials exist.
//
// This runs alongside the Locker on the same origin, so a session cookie set
// here is first-party for anyone who opens the Locker directly.

export const handler = async (event) => {
  let auth;
  try {
    auth = getAuth();
  } catch (error) {
    // A missing DATABASE_URL must read as "not configured", not as a crash
    // that leaves the caller guessing.
    console.error('[auth] not configured', error);
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Sign-in is not configured on this deploy.' }),
    };
  }

  const url = new URL(
    event.rawUrl ||
      `https://${event.headers.host}${event.path}${
        event.rawQuery ? `?${event.rawQuery}` : ''
      }`,
  );

  const headers = new Headers();
  for (const [key, value] of Object.entries(event.headers ?? {})) {
    if (value != null) headers.set(key, String(value));
  }

  const body =
    event.httpMethod === 'GET' || event.httpMethod === 'HEAD'
      ? undefined
      : event.isBase64Encoded
        ? Buffer.from(event.body ?? '', 'base64')
        : event.body ?? undefined;

  const response = await auth.handler(
    new Request(url, { method: event.httpMethod, headers, body }),
  );

  // set-cookie must survive as separate headers, which a plain object cannot
  // express — multiValueHeaders is the only way through Netlify's shim.
  const multiValueHeaders = {};
  const single = {};
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return;
    single[key] = value;
  });
  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [];
  if (cookies.length) multiValueHeaders['Set-Cookie'] = cookies;

  return {
    statusCode: response.status,
    headers: single,
    ...(cookies.length ? { multiValueHeaders } : {}),
    body: await response.text(),
  };
};
