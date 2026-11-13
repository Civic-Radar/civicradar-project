import { describe, expect, it } from 'vitest';
import { accessTokenExpiresAt, sessionState } from '../../lib/session';

// Issue #521: an access token that has expired must be noticed, so the app can
// send the user to the login page instead of showing pages that all fail.

// Builds a token shaped like a Supabase access token (header.payload.signature),
// with the payload base64url encoded the way JWTs are.
function tokenWith(claims: Record<string, unknown>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.signature`;
}

const NOW = Date.UTC(2026, 10, 13, 15, 0, 0);
const seconds = (ms: number) => Math.floor(ms / 1000);

describe('accessTokenExpiresAt (#521)', () => {
  it('reads the expiry time from the token', () => {
    expect(accessTokenExpiresAt(tokenWith({ exp: seconds(NOW) + 3600 }))).toBe(NOW + 3_600_000);
  });

  it('returns null for something that is not a JWT', () => {
    expect(accessTokenExpiresAt('not-a-token')).toBeNull();
    expect(accessTokenExpiresAt('a.%%%.c')).toBeNull();
    expect(accessTokenExpiresAt(tokenWith({ sub: 'user-1' }))).toBeNull();
  });
});

describe('sessionState (#521)', () => {
  it('is signed-out when no token is saved', () => {
    expect(sessionState(null, NOW)).toBe('signed-out');
    expect(sessionState('', NOW)).toBe('signed-out');
  });

  it('is active while the token has time left', () => {
    expect(sessionState(tokenWith({ exp: seconds(NOW) + 3600 }), NOW)).toBe('active');
  });

  it('is expired once the token is past its expiry time', () => {
    expect(sessionState(tokenWith({ exp: seconds(NOW) - 60 }), NOW)).toBe('expired');
  });

  it('is expired when the token ends within the next 30 seconds', () => {
    expect(sessionState(tokenWith({ exp: seconds(NOW) + 10 }), NOW)).toBe('expired');
  });

  it('is expired when the token cannot be read', () => {
    expect(sessionState('not-a-token', NOW)).toBe('expired');
  });
});