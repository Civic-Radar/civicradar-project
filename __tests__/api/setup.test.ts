import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const account = vi.hoisted(() => ({ row: null as { setup_status: string } | null }));

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (token: string) =>
        token === 'valid-token'
          ? { data: { user: { id: 'user-1' } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
      ),
    },
    from: vi.fn(() => {
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: account.row, error: null }),
      };
      return builder;
    }),
  })),
}));

import { GET } from '../../app/api/setup/route';
import { pathAfterSignIn } from '../../lib/setup';

function req(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/setup', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function needsSetup() {
  return (await (await GET(req())).json()).needs_setup;
}

describe('Setup start (SRS-107.1)', () => {
  beforeEach(() => {
    account.row = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports that a new user with no account row needs setup', async () => {
    const response = await GET(req());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ setup_status: 'Not started', needs_setup: true });
  });

  it('reports that a user who never completed or skipped setup needs setup', async () => {
    account.row = { setup_status: 'Not started' };
    expect(await needsSetup()).toBe(true);
  });

  it('does not send a user who completed or skipped setup back to setup', async () => {
    account.row = { setup_status: 'Completed' };
    expect(await needsSetup()).toBe(false);
    account.row = { setup_status: 'Skipped' };
    expect(await needsSetup()).toBe(false);
  });

  it('returns 401 without a token', async () => {
    expect((await GET(req(null))).status).toBe(401);
  });

  // Acceptance criterion: signing in opens the town selection section instead of the dashboard.
  it('sends a user who needs setup to the setup page after sign-in', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => GET(req())));
    expect(await pathAfterSignIn('valid-token')).toBe('/setup');
  });

  it('sends a user who finished setup to the dashboard after sign-in', async () => {
    account.row = { setup_status: 'Completed' };
    vi.stubGlobal('fetch', vi.fn(async () => GET(req())));
    expect(await pathAfterSignIn('valid-token')).toBe('/dashboard');
  });
});