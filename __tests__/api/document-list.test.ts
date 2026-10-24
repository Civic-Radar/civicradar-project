import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Stored = Record<string, string | number | null>;
type Call = { table: string; method: string; args: unknown[] };

// An in-memory stand-in for the three tables the route reads, so the route's own
// select, eq, in and order calls decide what comes back. It models only those
// calls and throws on anything else, and it is stricter than PostgREST on
// purpose (see the guard rails at the bottom of this file).
const db = vi.hoisted(() => ({
  follows: [] as Stored[],
  documents: [] as Stored[],
  towns: [] as Stored[],
  calls: [] as Call[],
  failures: {} as Record<string, { message: string }>,
}));

vi.mock('../../lib/supabase', () => {
  const COLUMNS: Record<string, string[]> = {
    user_followed_towns: ['user_id', 'town_id'],
    documents: [
      'document_id', 'meeting_id', 'town_id', 'source_file_id', 'title', 'document_type', 'source_url',
      'storage_path', 'mime_type', 'file_size_bytes', 'file_sha256', 'retrieved_at', 'baselined_at',
      'summary_status', 'summary_text', 'summary_generated_at',
    ],
    towns: [
      'town_id', 'name', 'source_account_id', 'meeting_time_zone', 'provides_agenda_items',
      'provides_recordings', 'publishes_vote_records', 'removed_at',
    ],
  };

  const users: Record<string, { id: string; email: string }> = {
    'valid-token': { id: 'user-123', email: 'resident@example.com' },
    'other-token': { id: 'user-456', email: 'other@example.com' },
    'both-token': { id: 'user-789', email: 'both@example.com' },
  };

  type Order = { column: string; ascending: boolean };
  type Query = {
    table: string;
    columns: string[] | null;
    filters: { kind: 'eq' | 'in'; column: string; value: unknown }[];
    orders: Order[];
  };

  function requireColumn(table: string, column: unknown): string {
    if (typeof column !== 'string' || !COLUMNS[table].includes(column)) {
      throw new Error(`The stand-in has no column ${String(column)} on ${table}`);
    }
    return column;
  }

  // Timestamps compare as instants, like PostgreSQL, not as text.
  function sortKey(column: string, value: unknown): number | string {
    return column === 'retrieved_at' ? Date.parse(String(value)) : (value as number | string);
  }

  function compare(orders: Order[], a: Stored, b: Stored): number {
    for (const { column, ascending } of orders) {
      const x = sortKey(column, a[column]);
      const y = sortKey(column, b[column]);
      if (x < y) return ascending ? -1 : 1;
      if (x > y) return ascending ? 1 : -1;
    }
    return 0;
  }

  function run(query: Query) {
    const failure = db.failures[query.table];
    if (failure) return { data: null, error: failure };

    if (!query.columns) throw new Error(`${query.table}: the query ran without select()`);
    const unknown = query.columns.find((column) => !COLUMNS[query.table].includes(column));
    if (unknown) return { data: null, error: { message: `column ${query.table}.${unknown} does not exist` } };

    const source = query.table === 'documents' ? db.documents : query.table === 'towns' ? db.towns : db.follows;
    const rows = source
      .filter((row) =>
        query.filters.every((filter) =>
          filter.kind === 'eq'
            ? row[filter.column] === filter.value
            : (filter.value as unknown[]).includes(row[filter.column]),
        ),
      )
      .sort((a, b) => compare(query.orders, a, b));

    // PostgreSQL returns tied rows in an unspecified order. Refuse a result whose
    // order is not total, so a missing tie-break cannot pass by luck.
    if (query.orders.length > 0 || query.table === 'documents') {
      for (let i = 1; i < rows.length; i += 1) {
        if (compare(query.orders, rows[i - 1], rows[i]) === 0) {
          throw new Error(`${query.table}: the order is not total, ties come back in an unspecified order`);
        }
      }
    }

    const columns = query.columns;
    return {
      data: rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]]))),
      error: null,
    };
  }

  function from(table: string) {
    if (!COLUMNS[table]) throw new Error(`The stand-in has no table ${table}`);
    const query: Query = { table, columns: null, filters: [], orders: [] };
    const record = (method: string, args: unknown[]) => db.calls.push({ table, method, args });

    const target = {
      select(...args: unknown[]) {
        record('select', args);
        const [columns] = args;
        if (args.length !== 1 || typeof columns !== 'string') throw new Error('The stand-in models select(columns) only');
        const names = columns.split(',').map((name) => name.trim());
        if (names.some((name) => !/^[a-z_]+$/.test(name))) {
          throw new Error(`The stand-in does not model select(${columns})`);
        }
        query.columns = names;
        return builder;
      },
      eq(...args: unknown[]) {
        record('eq', args);
        if (!query.columns) throw new Error(`${table}: eq() before select()`);
        query.filters.push({ kind: 'eq', column: requireColumn(table, args[0]), value: args[1] });
        return builder;
      },
      in(...args: unknown[]) {
        record('in', args);
        if (!query.columns) throw new Error(`${table}: in() before select()`);
        if (!Array.isArray(args[1]) || args[1].length === 0) {
          throw new Error(`${table}: in() needs a non-empty list; the route must not query with no ids`);
        }
        query.filters.push({ kind: 'in', column: requireColumn(table, args[0]), value: args[1] });
        return builder;
      },
      order(...args: unknown[]) {
        record('order', args);
        if (!query.columns) throw new Error(`${table}: order() before select()`);
        const options = args[1] as { ascending?: boolean } | undefined;
        query.orders.push({ column: requireColumn(table, args[0]), ascending: options?.ascending ?? true });
        return builder;
      },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        return Promise.resolve().then(() => run(query)).then(resolve, reject);
      },
    };

    // Any other method (insert, update, upsert, delete, limit, range, ...) throws.
    const builder: unknown = new Proxy(target, {
      get(t, key, receiver) {
        if (typeof key === 'string' && !(key in t)) {
          throw new Error(`The stand-in does not model .${key}() on ${table}`);
        }
        return Reflect.get(t, key, receiver);
      },
    });
    return builder;
  }

  return {
    getSupabaseClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn(async (token: string) => {
          const user = users[token];
          return user
            ? { data: { user }, error: null }
            : { data: { user: null }, error: { message: 'Invalid token' } };
        }),
      },
      from,
    })),
  };
});

import { GET } from '../../app/api/documents/route';
import { getSupabaseClient } from '../../lib/supabase';

const SALEM = 1; // Town A
const BROOKLINE = 2; // Town B
const USER = 'user-123'; // token "valid-token"
const OTHER_USER = 'user-456'; // token "other-token", follows Brookline only
const BOTH_USER = 'user-789'; // token "both-token", follows both towns

const SELECTED_FOLLOWS = 'town_id';
const SELECTED_DOCUMENTS = 'document_id, title, town_id, meeting_id, retrieved_at';
const RETURNED_KEYS = ['document_id', 'meeting_id', 'retrieved_at', 'title', 'town_id', 'town_name'];
const TOWN_NAMES: Record<number, string> = { [SALEM]: 'Town A', [BROOKLINE]: 'Town B' };
const LOAD_ERROR = 'Documents could not be loaded. Please try again.';
const dbError = { message: 'relation "documents" does not exist (42P01)' };

// Every column of a stored document, so the select projection is really exercised.
function doc(id: number, townId: number, retrievedAt: string): Stored {
  return {
    document_id: id,
    meeting_id: 1000 + id,
    town_id: townId,
    source_file_id: `file-${id}`,
    title: `Document ${id}`,
    document_type: 'Agenda',
    source_url: `https://example.org/files/${id}.pdf`,
    storage_path: `${townId}/file-${id}.pdf`,
    mime_type: 'application/pdf',
    file_size_bytes: 1024,
    file_sha256: 'a'.repeat(64),
    retrieved_at: retrievedAt,
    baselined_at: null,
    summary_status: 'Complete',
    summary_text: 'A stored summary the list must not return.',
    summary_generated_at: '2026-10-06T12:00:00+00:00',
  };
}

// 5 Town A (101-105) and 3 Town B (201-203) documents, stored out of order.
// 102, 104 and 201 share one retrieved_at, so only document_id breaks the tie.
const STORED = [
  doc(103, SALEM, '2026-09-20T12:00:00+00:00'),
  doc(201, BROOKLINE, '2026-10-05T12:00:00+00:00'),
  doc(101, SALEM, '2026-09-01T12:00:00+00:00'),
  doc(105, SALEM, '2026-08-15T12:00:00+00:00'),
  doc(202, BROOKLINE, '2026-10-10T12:00:00+00:00'),
  doc(102, SALEM, '2026-10-05T12:00:00+00:00'),
  doc(203, BROOKLINE, '2026-07-01T12:00:00+00:00'),
  doc(104, SALEM, '2026-10-05T12:00:00+00:00'),
];

// Newest retrieved_at first, then highest document_id (the placeholder order until SRS-209.1).
const TOWN_A_IDS = [104, 102, 103, 101, 105]; // 10-05 (104 before 102), 09-20, 09-01, 08-15
const TOWN_B_IDS = [202, 201, 203]; // 10-10, 10-05, 07-01
const TOWNS_A_AND_B_IDS = [202, 201, 104, 102, 103, 101, 105, 203]; // 10-10, 10-05 (201, 104, 102), 09-20, 09-01, 08-15, 07-01

function town(townId: number): Stored {
  return { town_id: townId, name: TOWN_NAMES[townId], source_account_id: `account-${townId}`, removed_at: null };
}

// What the list returns for a document: the five selected columns plus its town's name.
function listed(id: number) {
  const row = STORED.find((stored) => stored.document_id === id);
  if (!row) throw new Error(`No fixture document ${id}`);
  const { document_id, title, town_id, meeting_id, retrieved_at } = row;
  return { document_id, title, town_id, meeting_id, retrieved_at, town_name: TOWN_NAMES[town_id as number] };
}

function follow(userId: string, ...townIds: number[]) {
  for (const townId of townIds) {
    if (db.follows.some((row) => row.user_id === userId && row.town_id === townId)) {
      throw new Error(`Duplicate follow ${userId} ${townId}`);
    }
    db.follows.push({ user_id: userId, town_id: townId });
  }
}

function list(token: string | null = 'valid-token', headers?: Record<string, string>, query = '') {
  return GET(
    new Request(`http://localhost/api/documents${query}`, {
      headers: headers ?? (token ? { authorization: `Bearer ${token}` } : {}),
    }),
  );
}

function callsTo(table: string, method?: string) {
  return db.calls.filter((call) => call.table === table && (!method || call.method === method));
}

function getUserMock() {
  const client = vi.mocked(getSupabaseClient).mock.results[0]?.value;
  return client?.auth.getUser;
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  vi.mocked(getSupabaseClient).mockClear();
  db.calls.length = 0;
  db.failures = {};
  db.documents = STORED.map((row) => ({ ...row }));
  db.towns = [town(SALEM), town(BROOKLINE)];
  db.follows = [];
  // Other residents' follows are always stored, so a read that ignored the user would leak.
  follow(OTHER_USER, BROOKLINE);
  follow(BOTH_USER, SALEM, BROOKLINE);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/documents: which documents are listed (SRS-201.1)', () => {
  it('lists exactly the 5 Town A documents for a user who follows Town A only', async () => {
    follow(USER, SALEM);

    const response = await list();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(db.documents).toHaveLength(8);
    expect(body).toEqual({ documents: TOWN_A_IDS.map(listed) });
    expect(body.documents).toHaveLength(5);
    expect(body.documents.every((row: { town_id: number }) => row.town_id === SALEM)).toBe(true);
    expect(getUserMock()).toHaveBeenCalledWith('valid-token');
  });

  it('lists all 8 documents, newest first, for a user who follows Town A and Town B', async () => {
    follow(USER, SALEM, BROOKLINE);

    const response = await list();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ documents: TOWNS_A_AND_B_IDS.map(listed) });
    expect(body.documents).toHaveLength(8);
  });

  it('lists nothing, and does not query documents, for a user who follows no town', async () => {
    const response = await list();

    expect(response.status).toBe(200);
    expect(db.documents).toHaveLength(8);
    expect(await response.json()).toEqual({ documents: [] });
    expect(callsTo('documents')).toEqual([]);
    expect(db.calls.map((call) => `${call.table}.${call.method}`)).toEqual([
      'user_followed_towns.select',
      'user_followed_towns.eq',
    ]);
  });

  it.each([
    ['other-token', OTHER_USER, TOWN_B_IDS],
    ['both-token', BOTH_USER, TOWNS_A_AND_B_IDS],
  ])('lists only the documents %s follows', async (token, userId, ids) => {
    follow(USER, SALEM);

    const response = await list(token);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ documents: ids.map(listed) });
    expect(callsTo('user_followed_towns', 'eq')[0].args).toEqual(['user_id', userId]);
  });

  it('ignores a user_id in the query string', async () => {
    follow(USER, SALEM);

    const response = await list('valid-token', undefined, `?user_id=${OTHER_USER}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ documents: TOWN_A_IDS.map(listed) });
    expect(callsTo('user_followed_towns', 'eq')).toEqual([
      { table: 'user_followed_towns', method: 'eq', args: ['user_id', USER] },
    ]);
  });
});

describe('GET /api/documents: what the route asks the database', () => {
  it('reads the followed towns, then one filtered and ordered documents query, then the town names, with no writes', async () => {
    follow(USER, SALEM, BROOKLINE);

    await list();

    expect(db.calls.map((call) => `${call.table}.${call.method}`)).toEqual([
      'user_followed_towns.select',
      'user_followed_towns.eq',
      'documents.select',
      'documents.in',
      'documents.order',
      'documents.order',
      'towns.select',
      'towns.in',
    ]);
    expect(callsTo('user_followed_towns', 'select')[0].args).toEqual([SELECTED_FOLLOWS]);
    expect(callsTo('user_followed_towns', 'eq')[0].args).toEqual(['user_id', USER]);
    expect(callsTo('documents', 'select')[0].args).toEqual([SELECTED_DOCUMENTS]);
  });

  it('filters documents by the followed town ids', async () => {
    follow(USER, SALEM);
    await list();
    expect(callsTo('documents', 'in')[0].args).toEqual(['town_id', [SALEM]]);

    db.calls.length = 0;
    db.follows = [];
    follow(USER, SALEM, BROOKLINE);
    await list();
    const [column, ids] = callsTo('documents', 'in')[0].args as [string, number[]];
    expect(column).toBe('town_id');
    expect([...ids].sort()).toEqual([SALEM, BROOKLINE]);
    expect(ids.every((id) => typeof id === 'number')).toBe(true);
  });

  it('orders by retrieved_at descending, then document_id descending', async () => {
    follow(USER, SALEM, BROOKLINE);

    const response = await list();
    const ids = (await response.json()).documents.map((row: { document_id: number }) => row.document_id);

    expect(callsTo('documents', 'order').map((call) => call.args)).toEqual([
      ['retrieved_at', { ascending: false }],
      ['document_id', { ascending: false }],
    ]);
    // 201, 104 and 102 share one retrieved_at, so only the second order puts them in this sequence.
    expect(ids.slice(1, 4)).toEqual([201, 104, 102]);
  });

  it('returns exactly the five selected keys and town_name on each row and nothing else', async () => {
    follow(USER, SALEM, BROOKLINE);

    const body = await (await list()).json();

    expect(Object.keys(body)).toEqual(['documents']);
    for (const row of body.documents) {
      expect(Object.keys(row).sort()).toEqual(RETURNED_KEYS);
    }
    const text = JSON.stringify(body);
    expect(text).not.toContain('storage_path');
    expect(text).not.toContain('summary_text');
    expect(text).not.toContain('source_url');
  });
});

describe('GET /api/documents: signed out and configuration', () => {
  it('returns 401 without a token', async () => {
    const response = await list(null);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(getSupabaseClient).not.toHaveBeenCalled();
    expect(db.calls).toEqual([]);
  });

  it('returns 401 for an Authorization header that is not Bearer', async () => {
    const response = await list(null, { authorization: 'Basic dXNlcjpwYXNz' });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(getSupabaseClient).not.toHaveBeenCalled();
    expect(db.calls).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await list('bad-token');

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid or expired token.' });
    expect(getUserMock()).toHaveBeenCalledWith('bad-token');
    expect(db.calls).toEqual([]);
  });

  it('reports a configuration error and makes no database call without the service-role key', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    const response = await list();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Supabase credentials are not configured.' });
    expect(getSupabaseClient).not.toHaveBeenCalled();
    expect(db.calls).toEqual([]);
  });

  it('returns 500 when Supabase is not configured', async () => {
    vi.mocked(getSupabaseClient).mockReturnValueOnce(null);

    const response = await list();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Supabase credentials are not configured.' });
    expect(db.calls).toEqual([]);
  });
});

describe('GET /api/documents: read errors', () => {
  it('returns a fixed message, not the database error, and skips documents when the follows read fails', async () => {
    follow(USER, SALEM);
    db.failures.user_followed_towns = dbError;

    const response = await list();
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: LOAD_ERROR });
    expect(text).not.toContain(dbError.message);
    expect(text).not.toContain('42P01');
    expect(callsTo('user_followed_towns', 'select')).toHaveLength(1);
    expect(callsTo('documents')).toEqual([]);
  });

  it('returns a fixed message, not the database error, when the documents read fails', async () => {
    follow(USER, SALEM);
    db.failures.documents = dbError;

    const response = await list();
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: LOAD_ERROR });
    expect(text).not.toContain(dbError.message);
    expect(text).not.toContain('42P01');
    expect(callsTo('user_followed_towns', 'select')).toHaveLength(1);
    expect(callsTo('documents', 'select')).toHaveLength(1);
  });
});

// The stand-in refuses what the route must not do. These prove the guards are live,
// so a later change to the route (a write, limit/range pagination, a meetings read,
// an unordered or empty-list query) fails a test and needs a deliberate update.
describe('stand-in guard rails', () => {
  const client = () => getSupabaseClient()!;

  it('refuses a table the route does not read', () => {
    expect(() => client().from('meetings')).toThrow(/no table meetings/);
  });

  it.each(['insert', 'update', 'upsert', 'delete', 'limit', 'range'])('refuses .%s()', (method) => {
    const builder = client().from('documents') as unknown as Record<string, unknown>;
    expect(() => builder[method]).toThrow(/does not model/);
  });

  it('refuses in() with an empty list', () => {
    expect(() => client().from('documents').select('document_id').in('town_id', [])).toThrow(/non-empty list/);
  });

  it('refuses an order that leaves ties, and accepts the total order', async () => {
    const tied = client().from('documents').select('document_id').in('town_id', [SALEM])
      .order('retrieved_at', { ascending: false });
    await expect(Promise.resolve(tied)).rejects.toThrow(/not total/);

    const total = client().from('documents').select('document_id').in('town_id', [SALEM])
      .order('retrieved_at', { ascending: false })
      .order('document_id', { ascending: false });
    expect(await total).toEqual({ data: TOWN_A_IDS.map((id) => ({ document_id: id })), error: null });
  });

  it('returns an error for an unknown column', async () => {
    const result = await client().from('documents').select('no_such_column');
    expect(result.error?.message).toMatch(/no_such_column/);
  });
});
