import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error: { message: string } | null };
type Call = { table: string; method: string; args: unknown[] };

// Each from(table) call returns a chain that records its calls and resolves
// with the result registered for "<table>.<first method>", e.g. "meetings.select".
const db = vi.hoisted(() => ({
  results: {} as Record<string, Result>,
  calls: [] as Call[],
}));

vi.mock('../../lib/supabase', () => {
  function chain(table: string) {
    let operation = '';
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'upsert', 'delete', 'eq', 'maybeSingle']) {
      builder[method] = (...args: unknown[]) => {
        if (!operation) operation = method;
        db.calls.push({ table, method, args });
        return builder;
      };
    }
    builder.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(db.results[`${table}.${operation}`] ?? { data: null, error: null }).then(resolve, reject);
    return builder;
  }

  return {
    getSupabaseClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn(async (token: string) => {
          if (token === 'valid-token') {
            return { data: { user: { id: 'user-123', email: 'resident@example.com' } }, error: null };
          }
          if (token === 'no-email-token') {
            return { data: { user: { id: 'user-123' } }, error: null };
          }
          return { data: { user: null }, error: { message: 'Invalid token' } };
        }),
      },
      from: vi.fn((table: string) => chain(table)),
    })),
  };
});

import { DELETE, GET, PUT } from '../../app/api/followed-meetings/[meetingId]/route';
import { getSupabaseClient } from '../../lib/supabase';

const FOLLOW_ERROR = 'This meeting could not be followed. Please try again.';
const LOAD_ERROR = 'Whether you follow this meeting could not be loaded. Please try again.';
const UNFOLLOW_ERROR = 'This meeting could not be unfollowed. Please try again.';
const dbError = { message: 'relation "user_followed_meetings" does not exist (42P01)' };

function follow(meetingId: string, token: string | null = 'valid-token') {
  const request = new Request(`http://localhost/api/followed-meetings/${meetingId}`, {
    method: 'PUT',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return PUT(request, { params: { meetingId } });
}

function load(meetingId: string, token: string | null = 'valid-token') {
  const request = new Request(`http://localhost/api/followed-meetings/${meetingId}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return GET(request, { params: { meetingId } });
}

function unfollow(meetingId: string, token: string | null = 'valid-token') {
  const request = new Request(`http://localhost/api/followed-meetings/${meetingId}`, {
    method: 'DELETE',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return DELETE(request, { params: { meetingId } });
}

function callsTo(table: string, method: string) {
  return db.calls.filter((call) => call.table === table && call.method === method);
}

function writes() {
  return db.calls.filter((call) => call.method === 'upsert');
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  vi.mocked(getSupabaseClient).mockClear();
  db.calls.length = 0;
  db.results = {
    'meetings.select': { data: { meeting_id: 1192 }, error: null },
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('PUT /api/followed-meetings/[meetingId]', () => {
  it('returns 401 without a token', async () => {
    const response = await follow('1192', null);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(db.calls).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await follow('1192', 'bad-token');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid or expired token.' });
    expect(db.calls).toEqual([]);
  });

  it('reports a configuration error without the service-role key', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    const response = await follow('1192');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Supabase credentials are not configured.' });
    expect(getSupabaseClient).not.toHaveBeenCalled();
  });

  it('returns 500 when Supabase is not configured', async () => {
    vi.mocked(getSupabaseClient).mockReturnValueOnce(null);
    const response = await follow('1192');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Supabase credentials are not configured.' });
  });

  it.each(['abc', '0', '-5', '1.5', '1e3', '9007199254740993'])(
    'returns 400 for meeting id %s before any database call',
    async (meetingId) => {
      const response = await follow(meetingId);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Invalid meeting id.' });
      expect(db.calls).toEqual([]);
    },
  );

  it('follows the exact meeting id for the signed-in resident', async () => {
    const response = await follow('1192');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ meeting_id: 1192, followed: true });
    expect(callsTo('meetings', 'eq')[0].args).toEqual(['meeting_id', 1192]);
    expect(callsTo('user_accounts', 'upsert')[0].args).toEqual([
      { user_id: 'user-123', email: 'resident@example.com' },
      { onConflict: 'user_id', ignoreDuplicates: true },
    ]);
    expect(callsTo('user_followed_meetings', 'upsert')).toEqual([
      {
        table: 'user_followed_meetings',
        method: 'upsert',
        args: [{ user_id: 'user-123', meeting_id: 1192 }, { onConflict: 'user_id,meeting_id', ignoreDuplicates: true }],
      },
    ]);
  });

  it('is safe to repeat: both requests succeed with the same body and the same write', async () => {
    const first = await follow('1192');
    const second = await follow('1192');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    const follows = callsTo('user_followed_meetings', 'upsert');
    expect(follows).toHaveLength(2);
    expect(follows[1].args).toEqual(follows[0].args);
  });

  it('returns 404 for an unknown meeting and writes nothing', async () => {
    db.results['meetings.select'] = { data: null, error: null };

    const response = await follow('999999');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Meeting not found.' });
    expect(writes()).toEqual([]);
  });

  it('returns a fixed message when the meeting lookup fails', async () => {
    db.results['meetings.select'] = { data: null, error: dbError };

    const response = await follow('1192');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: FOLLOW_ERROR });
    expect(writes()).toEqual([]);
  });

  it('returns a fixed message when the account row cannot be created', async () => {
    db.results['user_accounts.upsert'] = { data: null, error: dbError };

    const response = await follow('1192');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: FOLLOW_ERROR });
    expect(callsTo('user_followed_meetings', 'upsert')).toEqual([]);
  });

  it('returns a fixed message when the user has no email', async () => {
    const response = await follow('1192', 'no-email-token');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: FOLLOW_ERROR });
    expect(writes()).toEqual([]);
  });

  it('returns a fixed message, not the database error, when saving the follow fails', async () => {
    db.results['user_followed_meetings.upsert'] = { data: null, error: dbError };

    const response = await follow('1192');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: FOLLOW_ERROR });
  });
});

describe('GET /api/followed-meetings/[meetingId]', () => {
  it('reports a followed meeting for the signed-in resident only', async () => {
    db.results['user_followed_meetings.select'] = { data: { meeting_id: 1192 }, error: null };

    const response = await load('1192');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ meeting_id: 1192, followed: true });
    expect(callsTo('user_followed_meetings', 'eq').map((call) => call.args)).toEqual([
      ['user_id', 'user-123'],
      ['meeting_id', 1192],
    ]);
    expect(writes()).toEqual([]);
  });

  it('reports a meeting the resident does not follow', async () => {
    const response = await load('1192');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ meeting_id: 1192, followed: false });
    expect(writes()).toEqual([]);
  });

  it('returns 401 without a token', async () => {
    const response = await load('1192', null);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(db.calls).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await load('1192', 'bad-token');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid or expired token.' });
    expect(db.calls).toEqual([]);
  });

  it('reports a configuration error without the service-role key', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    const response = await load('1192');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Supabase credentials are not configured.' });
    expect(getSupabaseClient).not.toHaveBeenCalled();
  });

  it.each(['abc', '0', '-5', '1.5', '1e3', '9007199254740993'])(
    'returns 400 for meeting id %s before any database call',
    async (meetingId) => {
      const response = await load(meetingId);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Invalid meeting id.' });
      expect(db.calls).toEqual([]);
    },
  );

  it('returns 404 for an unknown meeting without checking follows', async () => {
    db.results['meetings.select'] = { data: null, error: null };

    const response = await load('999999');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Meeting not found.' });
    expect(callsTo('user_followed_meetings', 'select')).toEqual([]);
  });

  it.each([
    ['meeting lookup', 'meetings.select'],
    ['follow lookup', 'user_followed_meetings.select'],
  ])('returns a fixed message, not the database error, when the %s fails', async (_label, key) => {
    db.results[key] = { data: null, error: dbError };

    const response = await load('1192');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: LOAD_ERROR });
    expect(writes()).toEqual([]);
  });
});

describe('DELETE /api/followed-meetings/[meetingId]', () => {
  it('returns 401 without a token', async () => {
    const response = await unfollow('1192', null);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(db.calls).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await unfollow('1192', 'bad-token');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid or expired token.' });
    expect(db.calls).toEqual([]);
  });

  it('reports a configuration error without the service-role key', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    const response = await unfollow('1192');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Supabase credentials are not configured.' });
    expect(getSupabaseClient).not.toHaveBeenCalled();
  });

  it.each(['abc', '0', '-5', '1.5', '1e3', '9007199254740993'])(
    'returns 400 for meeting id %s before any database call',
    async (meetingId) => {
      const response = await unfollow(meetingId);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Invalid meeting id.' });
      expect(db.calls).toEqual([]);
    },
  );

  it("removes only the signed-in resident's row for that exact meeting", async () => {
    const response = await unfollow('1192');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ meeting_id: 1192, followed: false });
    expect(callsTo('user_followed_meetings', 'delete')).toHaveLength(1);
    expect(callsTo('user_followed_meetings', 'eq').map((call) => call.args)).toEqual([
      ['user_id', 'user-123'],
      ['meeting_id', 1192],
    ]);
  });

  it('does not look up the meeting or create the account row', async () => {
    await unfollow('1192');

    expect(callsTo('meetings', 'select')).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it('is safe to repeat: unfollowing a meeting that is not followed still succeeds', async () => {
    const first = await unfollow('1192');
    const second = await unfollow('1192');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
  });

  it('returns a fixed message, not the database error, when removing the follow fails', async () => {
    db.results['user_followed_meetings.delete'] = { data: null, error: dbError };

    const response = await unfollow('1192');
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: UNFOLLOW_ERROR });
    expect(text).not.toContain(dbError.message);
  });
});
