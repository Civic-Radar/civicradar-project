import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { GET } from '../../app/api/role/route';

const USER_ID = 'user-1';

type Account = { account_role: unknown } | null;

// Fake Supabase client: getUser accepts only 'valid-token', and user_accounts
// returns the given row (or error). Every table read is recorded.
function createFakeSupabase(account: Account, accountError: { message: string } | null = null) {
  const tables: string[] = [];
  const accountQueries: { columns: string; column: string; value: unknown }[] = [];

  const client = {
    auth: {
      getUser: async (token: string) =>
        token === 'valid-token'
          ? { data: { user: { id: USER_ID } }, error: null }
          : { data: { user: null }, error: { message: 'invalid JWT' } },
    },
    from(table: string) {
      tables.push(table);
      if (table !== 'user_accounts') throw new Error(`Unexpected table: ${table}`);
      return {
        select: (columns: string) => ({
          eq: (column: string, value: unknown) => {
            accountQueries.push({ columns, column, value });
            return { maybeSingle: async () => ({ data: accountError ? null : account, error: accountError }) };
          },
        }),
      };
    },
  };

  return { client, tables, accountQueries };
}

let fake: ReturnType<typeof createFakeSupabase>;

function useFake(account: Account, accountError: { message: string } | null = null) {
  fake = createFakeSupabase(account, accountError);
  vi.mocked(getSupabaseClient).mockReturnValue(fake.client as unknown as ReturnType<typeof getSupabaseClient>);
}

function getRole(headers: Record<string, string> = {}) {
  return GET(new Request('http://localhost/api/role', { headers }));
}

async function expectBody(response: Response, status: number, body: unknown) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual(body);
}

describe('GET /api/role (SRS-220.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns true for the exact role System administrator', async () => {
    useFake({ account_role: 'System administrator' });

    await expectBody(await getRole({ authorization: 'Bearer valid-token' }), 200, { is_system_administrator: true });
    expect(fake.accountQueries).toEqual([{ columns: 'account_role', column: 'user_id', value: USER_ID }]);
  });

  it.each<[string | null]>([['User'], ['system administrator'], ['System administrator '], ['Admin'], [null]])(
    'returns false for the role %j',
    async (role) => {
      useFake({ account_role: role });

      await expectBody(await getRole({ authorization: 'Bearer valid-token' }), 200, { is_system_administrator: false });
    },
  );

  it('returns false when the user has no account row', async () => {
    useFake(null);

    await expectBody(await getRole({ authorization: 'Bearer valid-token' }), 200, { is_system_administrator: false });
  });

  it('returns 401 without a token and reads nothing', async () => {
    useFake({ account_role: 'System administrator' });

    await expectBody(await getRole(), 401, { error: 'Unauthorized' });
    expect(fake.tables).toEqual([]);
  });

  it('returns 401 when the Authorization header is not a bearer token', async () => {
    useFake({ account_role: 'System administrator' });

    await expectBody(await getRole({ authorization: 'Basic valid-token' }), 401, { error: 'Unauthorized' });
    expect(fake.tables).toEqual([]);
  });

  it('returns 401 for an invalid or expired token and reads no role', async () => {
    useFake({ account_role: 'System administrator' });

    await expectBody(await getRole({ authorization: 'Bearer expired-token' }), 401, { error: 'Invalid or expired token.' });
    expect(fake.tables).toEqual([]);
  });

  it('returns 500 with a fixed message, never the database message, when the role cannot be read', async () => {
    useFake(null, { message: 'connection reset' });

    const response = await getRole({ authorization: 'Bearer valid-token' });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: 'Your access could not be checked.' });
    expect(JSON.stringify(body)).not.toContain('connection reset');
  });

  it('returns 500 when the service role key is missing', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    useFake({ account_role: 'System administrator' });

    await expectBody(await getRole({ authorization: 'Bearer valid-token' }), 500, {
      error: 'Supabase credentials are not configured.',
    });
    expect(fake.tables).toEqual([]);
  });
});
