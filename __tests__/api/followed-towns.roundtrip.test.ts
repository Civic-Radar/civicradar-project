import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type TownRow = { town_id: number; name: string; removed_at: string | null };
type AccountRow = { user_id: string; email: string };
type FollowRow = { user_id: string; town_id: number };

// An in-memory stand-in for the three tables the route uses, so a save made by
// one request is visible to a later request. It models only the calls the
// route makes today and throws on anything else.
const store = vi.hoisted(() => ({
  towns: [] as TownRow[],
  accounts: [] as AccountRow[],
  follows: [] as FollowRow[],
}));

vi.mock('../../lib/supabase', () => {
  const residents: Record<string, { id: string; email: string }> = {
    'token-resident-1': { id: 'resident-1', email: 'one@example.com' },
    'token-resident-2': { id: 'resident-2', email: 'two@example.com' },
  };

  type Query = {
    operation: string;
    payload: unknown;
    options: unknown;
    filters: { kind: string; args: unknown[] }[];
    orderBy: string;
  };

  function unsupported(table: string, query: Query): never {
    throw new Error(`The stand-in does not model this call: ${table} ${JSON.stringify(query)}`);
  }

  function run(table: string, query: Query) {
    const shape = `${table}.${query.operation}(${query.filters.map((filter) => filter.kind).join(',')})`;
    const [first, second] = query.filters;
    const sameOptions = (expected: object) => JSON.stringify(query.options) === JSON.stringify(expected);

    if (shape === 'towns.select(is)' && query.orderBy === 'name') {
      if (first.args[0] !== 'removed_at' || first.args[1] !== null) unsupported(table, query);
      const rows = store.towns
        .filter((town) => town.removed_at === null)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(({ town_id, name }) => ({ town_id, name }));
      return { data: rows, error: null };
    }

    if (shape === 'user_followed_towns.select(eq)') {
      if (first.args[0] !== 'user_id') unsupported(table, query);
      const rows = store.follows
        .filter((follow) => follow.user_id === first.args[1])
        .map(({ town_id }) => ({ town_id }));
      return { data: rows, error: null };
    }

    if (shape === 'user_accounts.upsert()') {
      if (!sameOptions({ onConflict: 'user_id', ignoreDuplicates: true })) unsupported(table, query);
      const row = query.payload as AccountRow;
      if (!store.accounts.some((account) => account.user_id === row.user_id)) store.accounts.push({ ...row });
      return { data: null, error: null };
    }

    if (shape === 'user_followed_towns.upsert()') {
      if (!sameOptions({ onConflict: 'user_id,town_id', ignoreDuplicates: true })) unsupported(table, query);
      const rows = query.payload as FollowRow[];
      // Same outcome as the table's foreign keys to user_accounts and towns.
      const allowed = rows.every(
        (row) =>
          store.accounts.some((account) => account.user_id === row.user_id) &&
          store.towns.some((town) => town.town_id === row.town_id),
      );
      if (!allowed) return { data: null, error: { message: 'foreign key violation' } };
      for (const row of rows) {
        const exists = store.follows.some(
          (follow) => follow.user_id === row.user_id && follow.town_id === row.town_id,
        );
        if (!exists) store.follows.push({ ...row });
      }
      return { data: null, error: null };
    }

    if (shape === 'user_followed_towns.delete(eq)' || shape === 'user_followed_towns.delete(eq,not)') {
      if (first.args[0] !== 'user_id') unsupported(table, query);
      let keep: number[] = [];
      if (second) {
        const [column, operator, list] = second.args;
        if (column !== 'town_id' || operator !== 'in' || !/^\(\d+(,\d+)*\)$/.test(String(list))) {
          unsupported(table, query);
        }
        keep = String(list).slice(1, -1).split(',').map(Number);
      }
      store.follows = store.follows.filter(
        (follow) => follow.user_id !== first.args[1] || keep.includes(follow.town_id),
      );
      return { data: null, error: null };
    }

    return unsupported(table, query);
  }

  function from(table: string) {
    const query: Query = { operation: '', payload: undefined, options: undefined, filters: [], orderBy: '' };
    const builder = {
      select() { query.operation = 'select'; return builder; },
      upsert(payload: unknown, options: unknown) {
        query.operation = 'upsert'; query.payload = payload; query.options = options; return builder;
      },
      delete() { query.operation = 'delete'; return builder; },
      eq(...args: unknown[]) { query.filters.push({ kind: 'eq', args }); return builder; },
      is(...args: unknown[]) { query.filters.push({ kind: 'is', args }); return builder; },
      not(...args: unknown[]) { query.filters.push({ kind: 'not', args }); return builder; },
      order(column: string) { query.orderBy = column; return builder; },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        return Promise.resolve().then(() => run(table, query)).then(resolve, reject);
      },
    };
    return builder;
  }

  return {
    getSupabaseClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn(async (token: string) => {
          const user = residents[token];
          return user
            ? { data: { user }, error: null }
            : { data: { user: null }, error: { message: 'Invalid token' } };
        }),
      },
      from,
    })),
  };
});

import { GET, PUT } from '../../app/api/followed-towns/route';

const TOWN_A = 1; // Salem
const TOWN_B = 2; // Brookline
const RESIDENT_1 = 'token-resident-1';
const RESIDENT_2 = 'token-resident-2';

function request(method: string, token: string, body?: unknown) {
  return new Request('http://localhost/api/followed-towns', {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function save(token: string, townIds: number[]) {
  const response = await PUT(request('PUT', token, { town_ids: townIds }));
  expect(response.status).toBe(200);
}

// A fresh request with nothing carried over but the stored rows, which is what
// reloading the page or signing out and back in depends on.
async function reload(token: string): Promise<{ town_id: number; name: string; followed: boolean }[]> {
  const response = await GET(request('GET', token));
  expect(response.status).toBe(200);
  return (await response.json()).towns;
}

async function followedTowns(token: string) {
  return (await reload(token)).filter((town) => town.followed).map((town) => town.name);
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  store.towns = [
    { town_id: TOWN_A, name: 'Salem', removed_at: null },
    { town_id: TOWN_B, name: 'Brookline', removed_at: null },
    { town_id: 3, name: 'Oldtown', removed_at: '2026-01-01T00:00:00Z' },
  ];
  // Registration creates only the auth user, so no account rows exist yet.
  store.accounts = [];
  store.follows = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Followed towns round trip (SRS-401.6)', () => {
  it('keeps Towns A and B followed after saving both and reloading', async () => {
    await save(RESIDENT_1, [TOWN_A, TOWN_B]);

    expect(await followedTowns(RESIDENT_1)).toEqual(['Brookline', 'Salem']);
  });

  it('follows only Town B after Town A is deselected and saved', async () => {
    await save(RESIDENT_1, [TOWN_A, TOWN_B]);

    await save(RESIDENT_1, [TOWN_B]);

    expect(await reload(RESIDENT_1)).toEqual([
      { town_id: TOWN_B, name: 'Brookline', followed: true },
      { town_id: TOWN_A, name: 'Salem', followed: false },
    ]);
  });

  it('creates the account row on the first save and leaves it alone afterwards', async () => {
    await save(RESIDENT_1, [TOWN_A]);
    expect(store.accounts).toEqual([{ user_id: 'resident-1', email: 'one@example.com' }]);

    await save(RESIDENT_1, [TOWN_B]);
    expect(store.accounts).toEqual([{ user_id: 'resident-1', email: 'one@example.com' }]);
  });

  it("does not change another resident's followed towns", async () => {
    await save(RESIDENT_2, [TOWN_A]);
    await save(RESIDENT_1, [TOWN_A, TOWN_B]);

    await save(RESIDENT_1, [TOWN_B]);

    expect(await followedTowns(RESIDENT_2)).toEqual(['Salem']);
    expect(await followedTowns(RESIDENT_1)).toEqual(['Brookline']);
  });

  it('does not offer a removed town', async () => {
    const towns = await reload(RESIDENT_1);

    expect(towns.map((town) => town.name)).toEqual(['Brookline', 'Salem']);
  });
});
