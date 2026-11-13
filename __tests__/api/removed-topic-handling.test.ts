// SRS-101.9, KJ, Removed topic handling
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

// A tiny in-memory database shared by both routes, so a follow, a removal and a fresh load really round-trip.
// failDeleteOn makes a delete on that table fail, to test what happens when the follows cannot be cleared.
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, failDeleteOn: null as string | null }));

vi.mock('../../lib/supabase', () => {
  function query(table: string) {
    let operation: 'select' | 'upsert' | 'delete' | 'update' = 'select';
    let payload: Row[] = [];
    let changes: Row = {};
    const filters: ((row: Row) => boolean)[] = [];
    const key = (row: Row) => `${row.user_id}|${row.topic_id ?? ''}`;

    function run() {
      const rows = (db.tables[table] ??= []);
      const matches = (row: Row) => filters.every((match) => match(row));
      if (operation === 'upsert') {
        for (const row of payload) if (!rows.some((existing) => key(existing) === key(row))) rows.push({ ...row });
        return { data: null, error: null };
      }
      if (operation === 'delete') {
        if (db.failDeleteOn === table) return { data: null, error: { message: 'database down' } };
        db.tables[table] = rows.filter((row) => !matches(row));
        return { data: null, error: null };
      }
      if (operation === 'update') {
        const hit = rows.filter(matches);
        hit.forEach((row) => Object.assign(row, changes));
        return { data: hit, error: null };
      }
      return { data: rows.filter(matches), error: null };
    }

    const builder: Record<string, unknown> = {
      select: () => builder,
      order: () => builder,
      is: (column: string, value: unknown) => { filters.push((row) => (row[column] ?? null) === value); return builder; },
      eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder; },
      not: (column: string, _operator: string, list: string) => {
        const ids = list.slice(1, -1).split(',').map(Number);
        filters.push((row) => !ids.includes(row[column] as number));
        return builder;
      },
      upsert: (rows: Row | Row[]) => { operation = 'upsert'; payload = Array.isArray(rows) ? rows : [rows]; return builder; },
      delete: () => { operation = 'delete'; return builder; },
      update: (values: Row) => { operation = 'update'; changes = values; return builder; },
      maybeSingle: async () => {
        const result = run();
        return { data: (result.data as Row[] | null)?.[0] ?? null, error: null };
      },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return builder;
  }

  const users: Record<string, Row> = {
    'admin-token': { id: 'admin-1', email: 'admin@example.com' },
    'resident-token': { id: 'resident-1', email: 'resident@example.com' },
    'neighbor-token': { id: 'resident-2', email: 'neighbor@example.com' },
  };

  return {
    getSupabaseClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn(async (token: string) =>
          users[token]
            ? { data: { user: users[token] }, error: null }
            : { data: { user: null }, error: { message: 'Invalid token' } },
        ),
      },
      from: vi.fn((table: string) => query(table)),
    })),
  };
});

import { GET, PUT } from '../../app/api/followed-topics/route';
import { DELETE } from '../../app/api/topics/[topicId]/route';

const HOUSING = 1;
const PARKS = 9;

function req(method: string, token: string, body?: unknown) {
  return new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function followedNames(token: string) {
  const response = await GET(req('GET', token));
  const topics = (await response.json()).topics as { name: string; followed: boolean }[];
  return topics.filter((topic) => topic.followed).map((topic) => topic.name);
}

function removeParks(token = 'admin-token') {
  return DELETE(req('DELETE', token), { params: { topicId: String(PARKS) } });
}

function parksFollows() {
  return db.tables.user_followed_topics.filter((row) => row.topic_id === PARKS);
}

describe('Removed topic handling (SRS-101.9)', () => {
  beforeEach(() => {
    db.failDeleteOn = null;
    db.tables = {
      topics: [
        { topic_id: HOUSING, name: 'Housing', removed_at: null },
        { topic_id: PARKS, name: 'Parks', removed_at: null },
      ],
      user_accounts: [{ user_id: 'admin-1', email: 'admin@example.com', account_role: 'System administrator' }],
      user_followed_topics: [],
    };
  });

  // Acceptance criterion: the resident follows Housing and Parks; after Parks is removed, only Housing is left.
  it('leaves only Housing when a resident who follows Housing and Parks has Parks removed', async () => {
    await PUT(req('PUT', 'resident-token', { topic_ids: [HOUSING, PARKS] }));
    expect(await followedNames('resident-token')).toEqual(['Housing', 'Parks']);

    const response = await removeParks();

    expect(response.status).toBe(200);
    expect(await followedNames('resident-token')).toEqual(['Housing']);
  });

  it('deletes the stored follows of the removed topic and keeps the others', async () => {
    await PUT(req('PUT', 'resident-token', { topic_ids: [HOUSING, PARKS] }));

    await removeParks();

    expect(db.tables.user_followed_topics).toEqual([{ user_id: 'resident-1', topic_id: HOUSING }]);
  });

  it('removes the topic from every resident who followed it, not only one', async () => {
    await PUT(req('PUT', 'resident-token', { topic_ids: [PARKS] }));
    await PUT(req('PUT', 'neighbor-token', { topic_ids: [HOUSING, PARKS] }));
    expect(parksFollows()).toHaveLength(2);

    await removeParks();

    expect(parksFollows()).toEqual([]);
    expect(await followedNames('resident-token')).toEqual([]);
    expect(await followedNames('neighbor-token')).toEqual(['Housing']);
  });

  it('keeps the topic and its follows when the removal is not confirmed by an administrator', async () => {
    await PUT(req('PUT', 'resident-token', { topic_ids: [PARKS] }));

    const response = await removeParks('resident-token');

    expect(response.status).toBe(403);
    expect(await followedNames('resident-token')).toEqual(['Parks']);
  });

  it('puts the topic back when the follows cannot be cleared, so nothing is half removed', async () => {
    await PUT(req('PUT', 'resident-token', { topic_ids: [PARKS] }));
    db.failDeleteOn = 'user_followed_topics';

    const response = await removeParks();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'The topic could not be removed. Please try again.' });
    expect(db.tables.topics.find((topic) => topic.topic_id === PARKS)?.removed_at).toBeNull();
    db.failDeleteOn = null;
    expect(await followedNames('resident-token')).toEqual(['Parks']);
  });
});