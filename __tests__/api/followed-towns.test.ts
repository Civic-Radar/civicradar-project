import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error: { message: string } | null };
type Call = { table: string; method: string; args: unknown[] };

// Each from(table) call returns a chain that records its calls and resolves
// with the result registered for "<table>.<first method>", e.g. "towns.select".
const db = vi.hoisted(() => ({
  results: {} as Record<string, Result>,
  calls: [] as Call[],
}));

vi.mock('../../lib/supabase', () => {
  function chain(table: string) {
    let operation = '';
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'upsert', 'delete', 'eq', 'is', 'order', 'not']) {
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

import { GET, PUT } from '../../app/api/followed-towns/route';
import { getSupabaseClient } from '../../lib/supabase';

const salem = { town_id: 1, name: 'Salem' };
const brookline = { town_id: 2, name: 'Brookline' };
const dbError = { message: 'relation "towns" does not exist (42P01)' };

function req(method: string, body?: unknown, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/followed-towns', {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function callsTo(table: string, method: string) {
  return db.calls.filter((call) => call.table === table && call.method === method);
}

function writes() {
  return db.calls.filter((call) => call.method === 'upsert' || call.method === 'delete');
}

beforeEach(() => {
  db.calls.length = 0;
  db.results = {
    'towns.select': { data: [brookline, salem], error: null },
    'user_followed_towns.select': { data: [], error: null },
  };
});

describe('GET /api/followed-towns', () => {
  it('returns 401 without a token', async () => {
    const response = await GET(req('GET', undefined, null));
    expect(response.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await GET(req('GET', undefined, 'bad-token'));
    expect(response.status).toBe(401);
  });

  it('returns 500 when Supabase is not configured', async () => {
    vi.mocked(getSupabaseClient).mockReturnValueOnce(null);
    const response = await GET(req('GET'));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Supabase credentials are not configured.' });
  });

  it('lists every supported town with only the followed one marked', async () => {
    db.results['user_followed_towns.select'] = { data: [{ town_id: 1 }], error: null };

    const response = await GET(req('GET'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      towns: [
        { town_id: 2, name: 'Brookline', followed: false },
        { town_id: 1, name: 'Salem', followed: true },
      ],
    });
    expect(callsTo('towns', 'is')[0].args).toEqual(['removed_at', null]);
    expect(callsTo('user_followed_towns', 'eq')[0].args).toEqual(['user_id', 'user-123']);
    expect(writes()).toEqual([]);
  });

  it('marks no town as followed for a resident with no follows', async () => {
    const response = await GET(req('GET'));
    const { towns } = await response.json();
    expect(towns.map((town: { followed: boolean }) => town.followed)).toEqual([false, false]);
  });

  it('returns a fixed message, not the database error, when loading fails', async () => {
    db.results['towns.select'] = { data: null, error: dbError };

    const response = await GET(req('GET'));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Your followed towns could not be loaded. Please try again.',
    });
  });
});

describe('PUT /api/followed-towns', () => {
  it('returns 401 without a token', async () => {
    const response = await PUT(req('PUT', { town_ids: [1] }, null));
    expect(response.status).toBe(401);
    expect(writes()).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await PUT(req('PUT', { town_ids: [1] }, 'bad-token'));
    expect(response.status).toBe(401);
    expect(writes()).toEqual([]);
  });

  it.each([
    ['a body that is not JSON', 'not json'],
    ['a missing town_ids', {}],
    ['town_ids that is not a list', { town_ids: 1 }],
    ['a non-integer entry', { town_ids: [1, '2'] }],
    ['a fractional entry', { town_ids: [1.5] }],
    ['a zero or negative entry', { town_ids: [0] }],
  ])('returns 400 and writes nothing for %s', async (_label, body) => {
    const response = await PUT(req('PUT', body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'town_ids must be a list of town ids.' });
    expect(writes()).toEqual([]);
  });

  it('returns 400 and writes nothing for a town that is not supported', async () => {
    const response = await PUT(req('PUT', { town_ids: [1, 99] }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'One or more selected towns are not available.' });
    expect(writes()).toEqual([]);
  });

  it('replaces the selection: adds the new towns, then removes the others', async () => {
    db.results['user_followed_towns.select'] = { data: [{ town_id: 1 }, { town_id: 2 }], error: null };

    const response = await PUT(req('PUT', { town_ids: [1, 2], user_id: 'someone-else' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      towns: [
        { town_id: 2, name: 'Brookline', followed: true },
        { town_id: 1, name: 'Salem', followed: true },
      ],
    });

    expect(callsTo('user_accounts', 'upsert')[0].args).toEqual([
      { user_id: 'user-123', email: 'resident@example.com' },
      { onConflict: 'user_id', ignoreDuplicates: true },
    ]);
    expect(callsTo('user_followed_towns', 'upsert')[0].args).toEqual([
      [
        { user_id: 'user-123', town_id: 1 },
        { user_id: 'user-123', town_id: 2 },
      ],
      { onConflict: 'user_id,town_id', ignoreDuplicates: true },
    ]);
    expect(callsTo('user_followed_towns', 'not')[0].args).toEqual(['town_id', 'in', '(1,2)']);

    // The delete is scoped to the signed-in resident and runs after the add.
    const order = db.calls
      .filter((call) => call.table === 'user_followed_towns')
      .map((call) => call.method);
    expect(order.slice(0, 4)).toEqual(['upsert', 'delete', 'eq', 'not']);
    expect(order.indexOf('upsert')).toBeLessThan(order.indexOf('delete'));
    expect(callsTo('user_followed_towns', 'eq')[0].args).toEqual(['user_id', 'user-123']);
  });

  it('removes every follow and adds none for an empty list', async () => {
    const response = await PUT(req('PUT', { town_ids: [] }));

    expect(response.status).toBe(200);
    expect(callsTo('user_followed_towns', 'upsert')).toEqual([]);
    expect(callsTo('user_followed_towns', 'delete')).toHaveLength(1);
    expect(callsTo('user_followed_towns', 'eq')[0].args).toEqual(['user_id', 'user-123']);
    expect(callsTo('user_followed_towns', 'not')).toEqual([]);
  });

  it('collapses duplicate ids into one row', async () => {
    await PUT(req('PUT', { town_ids: [1, 1, 1] }));

    expect(callsTo('user_followed_towns', 'upsert')[0].args[0]).toEqual([
      { user_id: 'user-123', town_id: 1 },
    ]);
    expect(callsTo('user_followed_towns', 'not')[0].args).toEqual(['town_id', 'in', '(1)']);
  });

  it('does not remove anything when adding the new towns fails', async () => {
    db.results['user_followed_towns.upsert'] = { error: dbError };

    const response = await PUT(req('PUT', { town_ids: [1] }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Your followed towns could not be saved. Please try again.',
    });
    expect(callsTo('user_followed_towns', 'delete')).toEqual([]);
  });

  it('returns the fixed save message when the account row cannot be created', async () => {
    db.results['user_accounts.upsert'] = { error: dbError };

    const response = await PUT(req('PUT', { town_ids: [1] }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Your followed towns could not be saved. Please try again.',
    });
    expect(callsTo('user_followed_towns', 'upsert')).toEqual([]);
  });

  it('returns the save error and writes nothing when the auth user has no email', async () => {
    const response = await PUT(req('PUT', { town_ids: [1] }, 'no-email-token'));

    expect(response.status).toBe(500);
    expect(writes()).toEqual([]);
  });
});
