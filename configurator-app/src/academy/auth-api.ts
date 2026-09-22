/** Better Auth calls the academy pages make. Same endpoints the Locker uses. */

export async function authRequest<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(new URL(`/api/auth${path}`, window.location.origin), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error?.message || 'That did not work. Try again.');
  }
  return payload as T;
}

export const signUp = (input: { name: string; email: string; password: string }) =>
  authRequest<{ token?: string | null; user?: { id: string } }>('/sign-up/email', input);

export const signIn = (input: { email: string; password: string }) =>
  authRequest('/sign-in/email', input);

export const requestPasswordReset = (email: string, redirectTo: string) =>
  authRequest('/request-password-reset', { email, redirectTo });

export const signInWithGoogle = (callbackURL: string) =>
  authRequest<{ url?: string }>('/sign-in/social', { provider: 'google', callbackURL });

export const signOut = () => authRequest('/sign-out', {});
