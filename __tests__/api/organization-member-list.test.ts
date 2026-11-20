// SRS-103.1, KJ, Member permission display
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

describe('Member permission display (SRS-103.1)', () => {
  beforeEach(seed);

  // Acceptance criterion: an organization has three members with assigned permission levels;
  // the administrator opens the member list and sees each level next to that member.
  it('shows each of the three members with their permission level', async () => {
    const response = await GET(req('GET', 'admin-token'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.organization).toMatchObject({ organization_id: SALEM_NEWS, name: 'Salem News' });
    expect(data.my_permission_level).toBe('Administrator');
    expect(data.members).toEqual([
      { user_id: 'admin-1', email: 'admin@example.com', permission_level: 'Administrator' },
      { user_id: 'editor-1', email: 'editor@example.com', permission_level: 'Member' },
      { user_id: 'reporter-1', email: 'reporter@example.com', permission_level: 'Member' },
    ]);
  });

  it('lists Administrators first, then members by email', async () => {
    db.tables.organization_members[2].permission_level = 'Administrator';

    expect(await memberList()).toEqual([
      ['admin@example.com', 'Administrator'],
      ['editor@example.com', 'Administrator'],
      ['reporter@example.com', 'Member'],
    ]);
  });

  it('shows only the members of the requester\'s own organization', async () => {
    const emails = (await memberList()).map(([email]) => email);

    expect(emails).not.toContain('beverly@example.com');
    expect(emails).toHaveLength(3);
  });

  it('tells a member their own permission level', async () => {
    const response = await GET(req('GET', 'reporter-token'));
    const data = await response.json();

    expect(data.my_permission_level).toBe('Member');
    expect(data.members).toHaveLength(3);
  });

  it('returns no organization for a user who belongs to none', async () => {
    const response = await GET(req('GET', 'outsider-token'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ organization: null, my_user_id: 'outsider-1', my_permission_level: null, members: [] });
  });

  it('returns 401 without a token or with an invalid token', async () => {
    expect((await GET(req('GET', null))).status).toBe(401);
    expect((await GET(req('GET', 'bad-token'))).status).toBe(401);
  });

  it('returns 500 when the members cannot be read', async () => {
    db.failOn = 'organization_members';

    const response = await GET(req('GET', 'admin-token'));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'The organization could not be loaded. Please try again.' });
  });
});
