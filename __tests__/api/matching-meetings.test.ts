import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error: { message: string } | null };

// rpc(name, args) is recorded and resolves with the result registered for name.
const db = vi.hoisted(() => ({
  results: {} as Record<string, Result>,
  rpcCalls: [] as { name: string; args: unknown }[],
}));

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (token: string) => {
        if (token === 'valid-token') {
          return { data: { user: { id: 'user-123', email: 'resident@example.com' } }, error: null };
        }
        return { data: { user: null }, error: { message: 'Invalid token' } };
      }),
    },
    rpc: vi.fn(async (name: string, args: unknown) => {
      db.rpcCalls.push({ name, args });
      return db.results[name] ?? { data: null, error: null };
    }),
  })),
}));

import { GET } from '../../app/api/matching-meetings/route';
import { getSupabaseClient } from '../../lib/supabase';

const townAMeeting = { meeting_id: 1, town_id: 1, title: 'Town A Council' };
const townBMeeting = { meeting_id: 2, town_id: 2, title: 'Town B Planning Board' };
const dbError = { message: 'function match_meetings_with_reasons(uuid) does not exist (42883)' };

function req(token: string | null = 'valid-token', url = 'http://localhost/api/matching-meetings') {
  return new Request(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  vi.mocked(getSupabaseClient).mockClear();
  db.rpcCalls.length = 0;
  db.results = {};
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/matching-meetings', () => {
  it('returns 401 without a token', async () => {
    const response = await GET(req(null));
    expect(response.status).toBe(401);
    expect(db.rpcCalls).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await GET(req('bad-token'));
    expect(response.status).toBe(401);
    expect(db.rpcCalls).toEqual([]);
  });

  it('reports a configuration error without the service-role key', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    const response = await GET(req());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Supabase credentials are not configured.' });
    expect(getSupabaseClient).not.toHaveBeenCalled();
  });

  it('matches for the resident in the token, ignoring a user id in the URL', async () => {
    await GET(req('valid-token', 'http://localhost/api/matching-meetings?userId=someone-else'));

    expect(db.rpcCalls).toEqual([{ name: 'match_meetings_with_reasons', args: { p_user_id: 'user-123' } }]);
  });

  it('returns the matching meetings', async () => {
    db.results.match_meetings_with_reasons = { data: [townAMeeting, townBMeeting], error: null };

    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ meetings: [townAMeeting, townBMeeting] });
  });

  it('returns each meeting with its matching reason unchanged', async () => {
    const salemHousing = {
      meeting_id: 3,
      town_id: 1,
      title: 'Salem City Council',
      town: 'Salem',
      matched_topics: [{ topic: 'Housing', evidence_text: 'Item 4: affordable housing ordinance' }],
      followed_directly: false,
    };
    const followedOnly = {
      meeting_id: 4,
      town_id: 2,
      title: 'Beverly Planning Board',
      town: 'Beverly',
      matched_topics: [],
      followed_directly: true,
    };
    db.results.match_meetings_with_reasons = { data: [salemHousing, followedOnly], error: null };

    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ meetings: [salemHousing, followedOnly] });
  });

  it('returns an empty list when nothing matches', async () => {
    db.results.match_meetings_with_reasons = { data: [], error: null };

    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ meetings: [] });
  });

  it('returns a fixed message, not the database error, when matching fails', async () => {
    db.results.match_meetings_with_reasons = { data: null, error: dbError };

    const response = await GET(req());
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: 'Your matching meetings could not be loaded. Please try again.' });
    expect(text).not.toContain(dbError.message);
  });
});
