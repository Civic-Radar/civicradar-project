import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  upsert: vi.fn(async () => ({ error: null as null | { message: string } })),
  setupStatus: 'Skipped',
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
import { skipSetup } from '../../lib/setup';

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

describe('Setup skip (SRS-107.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    db.upsert.mockResolvedValue({ error: null });
    db.setupStatus = 'Skipped';
  });

  it('marks first-time setup as Skipped for the signed-in user', async () => {
    const res = await PATCH(req('PATCH', { setup_status: 'Skipped' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ setup_status: 'Skipped', needs_setup: false });
    expect(db.upsert).toHaveBeenCalledWith(
      { user_id: 'user-1', email: 'resident@example.com', setup_status: 'Skipped' },
      { onConflict: 'user_id' },
    );
  });

  // Acceptance criterion: the user is not sent to setup on the next sign-in
  it('does not send a user who skipped back to setup', async () => {
    const res = await GET(req('GET'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ setup_status: 'Skipped', needs_setup: false });
  });

  it('rejects any setup status other than Skipped', async () => {
    const res = await PATCH(req('PATCH', { setup_status: 'Completed' }));

    expect(res.status).toBe(400);
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it('returns 401 without a token', async () => {
    const res = await PATCH(req('PATCH', { setup_status: 'Skipped' }, null));
    expect(res.status).toBe(401);
  });

  it('returns 401 with an invalid token', async () => {
    const res = await PATCH(req('PATCH', { setup_status: 'Skipped' }, 'bad-token'));
    expect(res.status).toBe(401);
  });

  it('returns 500 when the status cannot be saved', async () => {
    db.upsert.mockResolvedValueOnce({ error: { message: 'database down' } });

    const res = await PATCH(req('PATCH', { setup_status: 'Skipped' }));
    expect(res.status).toBe(500);
  });

  it('skipSetup sends a PATCH and returns true when saved', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    expect(await skipSetup('valid-token')).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/setup', expect.objectContaining({ method: 'PATCH' }));
  });

  it('skipSetup returns false without a token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await skipSetup(undefined)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skipSetup returns false when the server fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));

    expect(await skipSetup('valid-token')).toBe(false);
  });
});