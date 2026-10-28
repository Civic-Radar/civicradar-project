// SRS-107.4, KJ, Setup completion
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  upsert: vi.fn(async () => ({ error: null as null | { message: string } })),
  setupStatus: 'Completed',
}));

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (token: string) =>
        token === 'valid-token'
          ? { data: { user: { id: 'user-1', email: 'resident@example.com' } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
      ),
    },
    from: vi.fn(() => ({
      upsert: db.upsert,
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { setup_status: db.setupStatus }, error: null }),
        }),
      }),
    })),
  })),
}));

import { GET, PATCH } from '../../app/api/setup/route';
import { completeSetup, pathAfterSignIn, stepAfterSave } from '../../lib/setup';

function req(method: string, body?: unknown, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/setup', {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('Setup completion (SRS-107.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    db.upsert.mockResolvedValue({ error: null });
    db.setupStatus = 'Completed';
  });

  it('finishes setup after the topic step is saved', () => {
    expect(stepAfterSave('topics')).toBe('done');
  });

  it('marks first-time setup as Completed for the signed-in user', async () => {
    const res = await PATCH(req('PATCH', { setup_status: 'Completed' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ setup_status: 'Completed', needs_setup: false });
    expect(db.upsert).toHaveBeenCalledWith(
      { user_id: 'user-1', email: 'resident@example.com', setup_status: 'Completed' },
      { onConflict: 'user_id' },
    );
  });

  // Acceptance criterion: after setup is completed, signing in opens the dashboard
  it('does not send a user who completed setup back to setup', async () => {
    const res = await GET(req('GET'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ setup_status: 'Completed', needs_setup: false });
  });

  it('opens the dashboard on sign-in after setup is completed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ setup_status: 'Completed', needs_setup: false })),
    );

    expect(await pathAfterSignIn('valid-token')).toBe('/dashboard');
  });

  it('returns 401 without a token', async () => {
    const res = await PATCH(req('PATCH', { setup_status: 'Completed' }, null));
    expect(res.status).toBe(401);
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it('completeSetup sends Completed and returns true when saved', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await completeSetup('valid-token')).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/setup',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ setup_status: 'Completed' }) }),
    );
  });

  it('completeSetup returns false without a token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await completeSetup(undefined)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('completeSetup returns false when the server fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));

    expect(await completeSetup('valid-token')).toBe(false);
  });
});