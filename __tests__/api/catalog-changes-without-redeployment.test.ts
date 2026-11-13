// SRS-104.5, KJ, Catalog changes without redeployment
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

// One in-memory database shared by the administrator routes and the resident routes, inside one
// running app (no restart, no redeployment), so a catalog change and the next resident load
// really round-trip.
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]> }));

vi.mock('../../lib/supabase', () => {
  const idColumns: Record<string, string> = { topics: 'topic_id', towns: 'town_id' };

  function query(table: string) {
    let operation: 'select' | 'insert' | 'upsert' | 'delete' | 'update' = 'select';
    let payload: Row[] = [];
    let changes: Row = {};
    const filters: ((row: Row) => boolean)[] = [];
    let sortColumn: string | null = null;

    function run() {
      const rows = (db.tables[table] ??= []);
      const matches = (row: Row) => filters.every((match) => match(row));
      if (operation === 'insert') {
        const idColumn = idColumns[table];
        const added = payload.map((row) => {
          const id = Math.max(0, ...rows.map((existing) => existing[idColumn] as number)) + 1;
          const stored = { [idColumn]: id, removed_at: null, ...row };
          rows.push(stored);
          return stored;
        });
        return { data: added, error: null };
      }
      if (operation === 'upsert') {
        for (const row of payload) {
          const exists = rows.some((existing) => Object.keys(row).every((key) => existing[key] === row[key]));
          if (!exists) rows.push({ ...row });
        }
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
      let found = rows.filter(matches);
      if (sortColumn) {
        const column = sortColumn;
        found = [...found].sort((a, b) => String(a[column]).localeCompare(String(b[column])));
      }
      return { data: found, error: null };
    }

    const builder: Record<string, unknown> = {
      select: () => builder,
      order: (column: string) => { sortColumn = column; return builder; },
      is: (column: string, value: unknown) => { filters.push((row) => (row[column] ?? null) === value); return builder; },
      eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder; },
      in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return builder; },
      not: (column: string, operator: string, value: unknown) => {
        if (operator === 'in') {
          const ids = String(value).slice(1, -1).split(',').map(Number);
          filters.push((row) => !ids.includes(row[column] as number));
        } else {
          filters.push((row) => (row[column] ?? null) !== value);
        }
        return builder;
      },
      insert: (rows: Row | Row[]) => { operation = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return builder; },
      upsert: (rows: Row | Row[]) => { operation = 'upsert'; payload = Array.isArray(rows) ? rows : [rows]; return builder; },
      delete: () => { operation = 'delete'; return builder; },
      update: (values: Row) => { operation = 'update'; changes = values; return builder; },
      single: async () => ({ data: (run().data as Row[])[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: (run().data as Row[] | null)?.[0] ?? null, error: null }),
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

import * as followedTopicsRoute from '../../app/api/followed-topics/route';
import * as followedTownsRoute from '../../app/api/followed-towns/route';
import { POST as addTopic } from '../../app/api/topics/route';
import { DELETE as removeTopic, PATCH as renameTopic } from '../../app/api/topics/[topicId]/route';
import { POST as addTown } from '../../app/api/towns/route';
import { DELETE as removeTown } from '../../app/api/towns/[townId]/route';

function req(method: string, token: string, body?: unknown) {
  return new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function residentTownNames() {
  const response = await followedTownsRoute.GET(req('GET', 'resident-token'));
  expect(response.status).toBe(200);
  return ((await response.json()).towns as { name: string }[]).map((town) => town.name);
}

async function residentTopicNames() {
  const response = await followedTopicsRoute.GET(req('GET', 'resident-token'));
  expect(response.status).toBe(200);
  return ((await response.json()).topics as { name: string }[]).map((topic) => topic.name);
}

describe('Catalog changes without redeployment (SRS-104.5)', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
    db.tables = {
      towns: [{ town_id: 1, name: 'Salem', source_account_id: 'salemma', meeting_time_zone: 'America/New_York', removed_at: null }],
      topics: [{ topic_id: 1, name: 'Housing', removed_at: null }],
      user_accounts: [{ user_id: 'admin-1', email: 'admin@example.com', account_role: 'System administrator' }],
      user_followed_towns: [],
      user_followed_topics: [],
    };
  });

  it('never serves the resident selection lists from a build-time snapshot or cache', () => {
    expect(followedTownsRoute.dynamic).toBe('force-dynamic');
    expect(followedTopicsRoute.dynamic).toBe('force-dynamic');
  });

  // Acceptance criterion: the administrator saves a new town; the resident's town preferences list it.
  it('lists a town the administrator just saved the next time the resident opens town preferences', async () => {
    expect(await residentTownNames()).toEqual(['Salem']);

    const saved = await addTown(req('POST', 'admin-token', {
      name: 'Beverly',
      source_account_id: 'beverlyma',
      meeting_time_zone: 'America/New_York',
    }));
    expect(saved.status).toBe(201);

    expect(await residentTownNames()).toEqual(['Beverly', 'Salem']);
  });

  it('drops a town the administrator just removed from the resident town list', async () => {
    const removed = await removeTown(req('DELETE', 'admin-token'), { params: { townId: '1' } });
    expect(removed.status).toBe(200);

    expect(await residentTownNames()).toEqual([]);
  });

  it('lists a topic the administrator just added in the resident topic list', async () => {
    const saved = await addTopic(req('POST', 'admin-token', { name: 'Parks Demo' }));
    expect(saved.status).toBe(201);

    expect(await residentTopicNames()).toEqual(['Housing', 'Parks Demo']);
  });

  it('shows a topic the administrator just renamed under its new name', async () => {
    const renamed = await renameTopic(req('PATCH', 'admin-token', { name: 'Housing & Rent' }), { params: { topicId: '1' } });
    expect(renamed.status).toBe(200);

    expect(await residentTopicNames()).toEqual(['Housing & Rent']);
  });

  it('drops a topic the administrator just removed from the resident topic list', async () => {
    const removed = await removeTopic(req('DELETE', 'admin-token'), { params: { topicId: '1' } });
    expect(removed.status).toBe(200);

    expect(await residentTopicNames()).toEqual([]);
  });
});