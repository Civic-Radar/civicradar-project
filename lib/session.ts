// Works out whether the saved sign-in is still usable (issue #521).
// Sign-in saves the Supabase access token, which is a JWT that stops working at
// its "exp" time (about an hour after sign-in by default). The token is not
// renewed, so once it has expired every API call fails with 401. Reading "exp"
// lets the app sign the user out clearly instead of showing broken pages.

export type SessionState = 'signed-out' | 'expired' | 'active';

// Treat a token that ends within this margin as already expired, so a request
// started just before the deadline doesn't fail halfway through.
const EXPIRY_MARGIN_MS = 30_000;

// The time the token stops working, in milliseconds since 1970, or null when the
// token can't be read as a JWT with a numeric "exp".
export function accessTokenExpiresAt(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof claims.exp === 'number' ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function sessionState(token: string | null, now: number = Date.now()): SessionState {
  if (!token) return 'signed-out';
  const expiresAt = accessTokenExpiresAt(token);
  if (expiresAt === null || expiresAt - EXPIRY_MARGIN_MS <= now) return 'expired';
  return 'active';
}