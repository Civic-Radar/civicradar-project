// SRS-103.3, KJ, Membership change restriction
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

// A small in-memory database shared by the organization routes, so a change and
// the next member list really round-trip. failOn makes every query on that table fail.
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, failOn: null as string | null }));

vi.mock('../../lib/supabase', () => {
  function query(table: string) {
    let operation: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: Row[] = [];
    let changes: Row = {};
    let columns = '*';
    const filters: ((row: Row) => boolean)[] = [];

    function run(): { data: Row[] | null; error: { message: string; code?: string } | null } {
      if (db.failOn === table) return { data: null, error: { message: 'database down' } };
      const rows = (db.tables[table] ??= []);
      const matches = (row: Row) => filters.every((match) => match(row));
      if (operation === 'insert') {
        for (const row of payload) {
          if (table === 'organization_members' && rows.some((existing) => existing.user_id === row.user_id)) {
            return { data: null, error: { message: 'duplicate key', code: '23505' } };
          }
        }
        payload.forEach((row) => rows.push({ ...row }));
        return { data: payload.map((row) => ({ ...row })), error: null };
      }
      if (operation === 'update') {
        const hit = rows.filter(matches);
        hit.forEach((row) => Object.assign(row, changes));
        return { data: hit.map((row) => ({ ...row })), error: null };
      }
      if (operation === 'delete') {
        const hit = rows.filter(matches);
        db.tables[table] = rows.filter((row) => !matches(row));
        return { data: hit, error: null };
      }
      let found = rows.filter(matches).map((row) => ({ ...row }));
      if (columns.includes('user_accounts(email)')) {
        found = found.map((row) => ({
          ...row,
          user_accounts: (db.tables.user_accounts ?? []).find((account) => account.user_id === row.user_id) ?? null,
        }));
      }
      return { data: found, error: null };
    }

    const builder: Record<string, unknown> = {
      select: (cols?: string) => { if (operation === 'select' && cols) columns = cols; return builder; },
      eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder; },
      insert: (rows: Row | Row[]) => { operation = 'insert'; payload = Array.isArray(rows) ? rows : [rows]; return builder; },
      update: (values: Row) => { operation = 'update'; changes = values; return builder; },
      delete: () => { operation = 'delete'; return builder; },
      single: async () => {
        const result = run();
        return { data: result.data?.[0] ?? null, error: result.error };
      },
      maybeSingle: async () => {
        const result = run();
        return { data: result.data?.[0] ?? null, error: result.error };
      },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return builder;
  }

  const users: Record<string, Row> = {
    'admin-token': { id: 'admin-1', email: 'admin@example.com' },
    'reporter-token': { id: 'reporter-1', email: 'reporter@example.com' },
    'editor-token': { id: 'editor-1', email: 'editor@example.com' },
    'outsider-token': { id: 'outsider-1', email: 'outsider@example.com' },
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

import { GET, POST } from '../../app/api/organization/members/route';
import { DELETE } from '../../app/api/organization/members/[userId]/route';

const SALEM_NEWS = 1;
const OTHER_ORG = 2;

function req(method: string, token: string | null, body?: unknown) {
  return new Request('http://localhost/api/organization/members', {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Salem News has three members: one Administrator and two Members.
function seed() {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  db.failOn = null;
  db.tables = {
    organizations: [
      { organization_id: SALEM_NEWS, name: 'Salem News', account_status: 'Active' },
      { organization_id: OTHER_ORG, name: 'Beverly Times', account_status: 'Active' },
    ],
    user_accounts: [
      { user_id: 'admin-1', email: 'admin@example.com' },
      { user_id: 'reporter-1', email: 'reporter@example.com' },
      { user_id: 'editor-1', email: 'editor@example.com' },
      { user_id: 'outsider-1', email: 'outsider@example.com' },
      { user_id: 'beverly-1', email: 'beverly@example.com' },
    ],
    organization_members: [
      { organization_id: SALEM_NEWS, user_id: 'admin-1', permission_level: 'Administrator' },
      { organization_id: SALEM_NEWS, user_id: 'reporter-1', permission_level: 'Member' },
      { organization_id: SALEM_NEWS, user_id: 'editor-1', permission_level: 'Member' },
      { organization_id: OTHER_ORG, user_id: 'beverly-1', permission_level: 'Administrator' },
    ],
  };
}

async function memberList(token = 'admin-token') {
  const response = await GET(req('GET', token));
  expect(response.status).toBe(200);
  const data = await response.json();
  return (data.members as { email: string; permission_level: string }[]).map((member) => [member.email, member.permission_level]);
}

const DENIED = { error: 'Only an organization administrator can add or remove members.' };
const STARTING_LIST = [
  ['admin@example.com', 'Administrator'],
  ['editor@example.com', 'Member'],
  ['reporter@example.com', 'Member'],
];

function addMember(email: unknown, token = 'admin-token') {
  return POST(req('POST', token, { email }));
}

function removeMember(userId: string, token = 'admin-token') {
  return DELETE(req('DELETE', token), { params: { userId } });
}

describe('Membership change restriction (SRS-103.3)', () => {
  beforeEach(seed);

  // Acceptance criterion: a member without the member-management permission tries to
  // add or remove another member; the system denies it and the member list is unchanged.
  it('denies a Member who tries to add a member, and the list is unchanged', async () => {
    const response = await addMember('outsider@example.com', 'reporter-token');

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(DENIED);
    expect(await memberList()).toEqual(STARTING_LIST);
  });

  it('denies a Member who tries to remove another member, and the list is unchanged', async () => {
    const response = await removeMember('editor-1', 'reporter-token');

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(DENIED);
    expect(await memberList()).toEqual(STARTING_LIST);
  });

  it('denies a Member who tries to remove the Administrator', async () => {
    expect((await removeMember('admin-1', 'editor-token')).status).toBe(403);
    expect(await memberList()).toEqual(STARTING_LIST);
  });

  it('denies a user who belongs to no organization', async () => {
    expect((await addMember('outsider@example.com', 'outsider-token')).status).toBe(403);
    expect((await removeMember('reporter-1', 'outsider-token')).status).toBe(403);
    expect(await memberList()).toEqual(STARTING_LIST);
  });

  it('lets the Administrator add an account as a Member', async () => {
    const response = await addMember('Outsider@Example.com');

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      member: { user_id: 'outsider-1', email: 'outsider@example.com', permission_level: 'Member' },
    });
    expect(await memberList()).toContainEqual(['outsider@example.com', 'Member']);
  });

  it('lets the Administrator remove a member', async () => {
    const response = await removeMember('editor-1');

    expect(response.status).toBe(200);
    expect(await memberList()).toEqual([
      ['admin@example.com', 'Administrator'],
      ['reporter@example.com', 'Member'],
    ]);
  });

  it('does not add an account that already belongs to an organization', async () => {
    const response = await addMember('beverly@example.com');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'That account already belongs to an organization.' });
    expect(await memberList()).toEqual(STARTING_LIST);
  });

  it('does not add an email that has no Civic Radar account', async () => {
    const response = await addMember('nobody@example.com');

    expect(response.status).toBe(404);
    expect(await memberList()).toEqual(STARTING_LIST);
  });

  it('asks for an email', async () => {
    const response = await addMember('  ');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Email is required.', missingFields: ['email'] });
  });

  it('does not remove the last Administrator', async () => {
    const response = await removeMember('admin-1');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'An organization needs at least one Administrator.' });
    expect(await memberList()).toEqual(STARTING_LIST);
  });

  it('cannot remove a member of another organization', async () => {
    const response = await removeMember('beverly-1');

    expect(response.status).toBe(404);
    expect(db.tables.organization_members.some((row) => row.user_id === 'beverly-1')).toBe(true);
  });

  it('returns 401 without a token', async () => {
    expect((await addMember('outsider@example.com', '')).status).toBe(401);
    expect((await removeMember('editor-1', '')).status).toBe(401);
  });
});
