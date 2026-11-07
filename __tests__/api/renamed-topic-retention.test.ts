// SRS-101.8, KJ, Renamed topic retention
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

// A tiny in-memory database shared by both routes, so a follow, a rename and a fresh load really round-trip.
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }));

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
import { PATCH } from '../../app/api/topics/[topicId]/route';

const HOUSING = 1;
const PARKS = 9;

function req(method: string, token: string, body?: unknown) {
  return new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function residentTopics() {
  const response = await GET(req('GET', 'resident-token'));
  return (await response.json()).topics as { topic_id: number; name: string; followed: boolean }[];
}

async function followedNames() {
  return (await residentTopics()).filter((topic) => topic.followed).map((topic) => topic.name);
}

async function renameParks() {
  const response = await PATCH(req('PATCH', 'admin-token', { name: 'Parks & Playgrounds' }), { params: { topicId: String(PARKS) } });
  expect(response.status).toBe(200);
}

describe('Renamed topic retention (SRS-101.8)', () => {
  beforeEach(() => {
    db.tables = {
      topics: [
        { topic_id: HOUSING, name: 'Housing', removed_at: null },
        { topic_id: PARKS, name: 'Parks', removed_at: null },
      ],
      user_accounts: [{ user_id: 'admin-1', email: 'admin@example.com', account_role: 'System administrator' }],
      user_followed_topics: [],
    };
  });

  // Acceptance criterion: the resident follows "Parks"; after the rename the new name is shown as selected.
  it('shows the renamed topic as selected for a resident who followed it', async () => {
    await PUT(req('PUT', 'resident-token', { topic_ids: [PARKS] }));
    expect(await followedNames()).toEqual(['Parks']);

    await renameParks();

    expect(await followedNames()).toEqual(['Parks & Playgrounds']);
  });

  it('does not change the stored follow, which points at topic_id', async () => {
    await PUT(req('PUT', 'resident-token', { topic_ids: [PARKS] }));

    await renameParks();

    expect(db.tables.user_followed_topics).toEqual([{ user_id: 'resident-1', topic_id: PARKS }]);
  });

  it('keeps the resident\'s other followed topics as they were', async () => {
    await PUT(req('PUT', 'resident-token', { topic_ids: [HOUSING, PARKS] }));

    await renameParks();

    expect(await followedNames()).toEqual(['Housing', 'Parks & Playgrounds']);
  });

  it('shows the renamed topic as not selected for a resident who never followed it', async () => {
    await PUT(req('PUT', 'resident-token', { topic_ids: [HOUSING] }));

    await renameParks();

    const parks = (await residentTopics()).find((topic) => topic.topic_id === PARKS);
    expect(parks?.name).toBe('Parks & Playgrounds');
    expect(parks?.followed).toBe(false);
  });
});