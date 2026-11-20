// SRS-103.2, KJ, Permission assignment
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

import { GET } from '../../app/api/organization/members/route';
import { PATCH } from '../../app/api/organization/members/[userId]/route';

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

function assign(userId: string, permissionLevel: unknown, token = 'admin-token') {
  return PATCH(req('PATCH', token, { permission_level: permissionLevel }), { params: { userId } });
}

describe('Permission assignment (SRS-103.2)', () => {
  beforeEach(seed);

  // Acceptance criterion: a listed member is assigned a different level, and the
  // member list then shows the newly assigned level for that member.
  it('shows the newly assigned level in the member list', async () => {
    const response = await assign('reporter-1', 'Administrator');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      member: { user_id: 'reporter-1', email: 'reporter@example.com', permission_level: 'Administrator' },
    });
    expect(await memberList()).toEqual([
      ['admin@example.com', 'Administrator'],
      ['reporter@example.com', 'Administrator'],
      ['editor@example.com', 'Member'],
    ]);
  });

  it('can change an Administrator back to a Member while another Administrator remains', async () => {
    await assign('reporter-1', 'Administrator');

    const response = await assign('reporter-1', 'Member');

    expect(response.status).toBe(200);
    expect(await memberList()).toContainEqual(['reporter@example.com', 'Member']);
  });

  it('changes only that member', async () => {
    await assign('editor-1', 'Administrator');

    expect(await memberList()).toContainEqual(['reporter@example.com', 'Member']);
  });

  it('keeps at least one Administrator in the organization', async () => {
    const response = await assign('admin-1', 'Member');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'An organization needs at least one Administrator.' });
    expect(await memberList()).toContainEqual(['admin@example.com', 'Administrator']);
  });

  it('denies a Member who tries to change a permission level, and nothing changes', async () => {
    const response = await assign('reporter-1', 'Administrator', 'editor-token');

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Only an organization administrator can change permission levels.' });
    expect(await memberList()).toContainEqual(['reporter@example.com', 'Member']);
  });

  it('denies a user who belongs to no organization', async () => {
    expect((await assign('reporter-1', 'Administrator', 'outsider-token')).status).toBe(403);
  });

  it('cannot change a member of another organization', async () => {
    const response = await assign('beverly-1', 'Member');

    expect(response.status).toBe(404);
    expect(db.tables.organization_members.find((row) => row.user_id === 'beverly-1')?.permission_level).toBe('Administrator');
  });

  it('rejects a level that is not Member or Administrator', async () => {
    const response = await assign('reporter-1', 'Owner');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Permission level must be Member or Administrator.' });
  });

  it('returns 401 without a token', async () => {
    expect((await assign('reporter-1', 'Administrator', '')).status).toBe(401);
  });
});
