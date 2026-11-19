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

import { GET } from '../../app/api/alerts/route';

const alert = {
  alert_id: 7,
  created_at: '2026-11-19T15:05:00Z',
  update_type: 'Document published',
  new_value: 'Budget Attachment',
  detected_at: '2026-11-19T15:05:00Z',
  meeting_id: 42,
  meeting_title: 'City Council',
  start_at: '2026-11-25T00:00:00Z',
  town: 'Salem',
  meeting_time_zone: 'America/New_York',
};

function req(token: string | null = 'valid-token', url = 'http://localhost/api/alerts') {
  return new Request(url, { headers: token ? { authorization: `Bearer ${token}` } : {} });
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  db.rpcCalls.length = 0;
  db.results = {};
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/alerts (SRS-404.3)', () => {
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

  it("returns the signed-in resident's alerts with the meeting and the new material", async () => {
    db.results.list_user_alerts = { data: [alert], error: null };
    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ alerts: [alert] });
  });

  it('asks only for the resident in the token, even if the URL names someone else', async () => {
    await GET(req('valid-token', 'http://localhost/api/alerts?user_id=someone-else'));
    expect(db.rpcCalls).toEqual([{ name: 'list_user_alerts', args: { p_user_id: 'user-123' } }]);
  });

  it('returns an empty list when the resident has no alerts', async () => {
    db.results.list_user_alerts = { data: [], error: null };
    const response = await GET(req());
    expect(await response.json()).toEqual({ alerts: [] });
  });

  it('returns 500 with a plain message when the alerts cannot be read', async () => {
    db.results.list_user_alerts = { data: null, error: { message: 'function list_user_alerts(uuid) does not exist' } };
    const response = await GET(req());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Your alerts could not be loaded. Please try again.' });
  });
});
