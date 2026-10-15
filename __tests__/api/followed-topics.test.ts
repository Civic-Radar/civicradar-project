// SRS-101.4, KJ, Saved topic preferences
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

// A tiny in-memory database, so a save followed by a fresh load really round-trips.
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }));

vi.mock('../../lib/supabase', () => {
  function query(table: string) {
    let operation: 'select' | 'upsert' | 'delete' = 'select';
    let payload: Row[] = [];
    const filters: ((row: Row) => boolean)[] = [];
    const key = (row: Row) => `${row.user_id}|${row.topic_id ?? ''}`;

    function run() {
      const rows = (db.tables[table] ??= []);
      if (operation === 'upsert') {
        for (const row of payload) if (!rows.some((existing) => key(existing) === key(row))) rows.push({ ...row });
        return { data: null, error: null };
      }
      if (operation === 'delete') {
        db.tables[table] = rows.filter((row) => !filters.every((match) => match(row)));
        return { data: null, error: null };
      }
      return { data: rows.filter((row) => filters.every((match) => match(row))), error: null };
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
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return builder;
  }

  return {
    getSupabaseClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn(async (token: string) =>
          token === 'valid-token'
            ? { data: { user: { id: 'resident-1', email: 'resident@example.com' } }, error: null }
            : { data: { user: null }, error: { message: 'Invalid token' } },
        ),
      },
      from: vi.fn((table: string) => query(table)),
    })),
  };
});

import { GET, PUT } from '../../app/api/followed-topics/route';

const HOUSING = 1;
const PARKING = 2;

function req(method: string, body?: unknown, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/followed-topics', {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function followedNames() {
  const response = await GET(req('GET'));
  const { topics } = await response.json();
  return topics.filter((topic: { followed: boolean }) => topic.followed).map((topic: { name: string }) => topic.name);
}

describe('Saved topic preferences (SRS-101.4)', () => {
  beforeEach(() => {
    db.tables = {
      topics: [
        { topic_id: HOUSING, name: 'Housing', removed_at: null },
        { topic_id: PARKING, name: 'Transportation & Parking', removed_at: null },
        { topic_id: 3, name: 'School Budget', removed_at: null },
      ],
      user_accounts: [],
      user_followed_topics: [],
    };
  });

  // Acceptance criterion: save Housing and Parking, sign in again, both still selected.
  it('keeps Housing and Parking selected when the resident comes back', async () => {
    const saved = await PUT(req('PUT', { topic_ids: [HOUSING, PARKING] }));
    expect(saved.status).toBe(200);

    // Signing back in loads the section again from the database.
    expect(await followedNames()).toEqual(['Housing', 'Transportation & Parking']);
  });

  it('removes a topic the resident deselects', async () => {
    await PUT(req('PUT', { topic_ids: [HOUSING, PARKING] }));
    await PUT(req('PUT', { topic_ids: [PARKING] }));

    expect(await followedNames()).toEqual(['Transportation & Parking']);
  });

  it('creates the user account row before saving', async () => {
    await PUT(req('PUT', { topic_ids: [HOUSING] }));
    expect(db.tables.user_accounts).toEqual([{ user_id: 'resident-1', email: 'resident@example.com' }]);
  });

  it('rejects a topic that is not in the catalog', async () => {
    const response = await PUT(req('PUT', { topic_ids: [999] }));
    expect(response.status).toBe(400);
    expect(db.tables.user_followed_topics).toEqual([]);
  });

  it('returns 401 without a token', async () => {
    const response = await GET(req('GET', undefined, null));
    expect(response.status).toBe(401);
  });
});