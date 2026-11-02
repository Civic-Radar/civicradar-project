import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SourceMeeting } from '../../lib/sources/types';

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('../../lib/sources/civicclerk', () => ({
  fetchMeetings: vi.fn(),
  fetchMeetingFiles: vi.fn(),
  fetchAgendaItems: vi.fn(),
  downloadFile: vi.fn(),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { downloadFile, fetchMeetingFiles, fetchMeetings } from '../../lib/sources/civicclerk';
import { POST } from '../../app/api/retrieval/meetings/route';

type Row = Record<string, unknown>;

const SALEM_TOWN_ID = 1;
const USER_ID = 'user-1';

const MEETING_1192: SourceMeeting = {
  sourceMeetingId: '1192',
  title: 'City Council',
  sourceBodyId: '1',
  sourceBodyName: 'City Council',
  sourceStartTime: '2026-10-08T19:00:00Z',
  location: 'City Hall',
  onlineLink: null,
  sourceUrl: 'https://example.test/event/1192',
};

type Account = { account_role: unknown } | null;

// Fake Supabase client: getUser accepts only 'valid-token', user_accounts
// returns the given row (or error), and every table, Storage and rpc call is
// recorded so a refused request can be shown to have touched nothing else.
function createFakeSupabase(account: Account, accountError: { message: string } | null = null) {
  const tables: string[] = [];
  const accountQueries: { column: string; value: unknown }[] = [];
  const meetingUpserts: Row[] = [];
  const storageCalls: string[] = [];
  const rpcCalls: string[] = [];

  const client = {
    auth: {
      getUser: async (token: string) =>
        token === 'valid-token'
          ? { data: { user: { id: USER_ID } }, error: null }
          : { data: { user: null }, error: { message: 'invalid JWT' } },
    },
    from(table: string) {
      tables.push(table);

      if (table === 'user_accounts') {
        return {
          select: () => ({
            eq: (column: string, value: unknown) => {
              accountQueries.push({ column, value });
              return { maybeSingle: async () => ({ data: accountError ? null : account, error: accountError }) };
            },
          }),
        };
      }

      if (table === 'towns') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({
                  data: {
                    town_id: SALEM_TOWN_ID,
                    source_account_id: 'salemma',
                    meeting_time_zone: 'America/New_York',
                    provides_agenda_items: false,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'governing_bodies') {
        return { select: () => ({ eq: () => ({ is: async () => ({ data: [], error: null }) }) }) };
      }

      if (table === 'meetings') {
        return {
          upsert: (rows: Row[]) => {
            meetingUpserts.push(...rows);
            return { select: async () => ({ data: rows.map((_, index) => ({ meeting_id: 501 + index })), error: null }) };
          },
          select: () => ({
            eq: () => ({
              in: async () => ({
                data: meetingUpserts.map((row, index) => ({ ...row, meeting_id: 501 + index })),
                error: null,
              }),
            }),
          }),
        };
      }

      // The run's check row (SRS-222.1), opened and closed without assertions here.
      if (table === 'source_checks') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { check_id: 1, started_at: new Date().toISOString() }, error: null }),
            }),
          }),
          update: () => ({ eq: async () => ({ data: null, error: null }) }),
        };
      }

      // Agenda items (SRS-220.9), stored without assertions here.
      if (table === 'agenda_items') {
        return { upsert: async () => ({ data: null, error: null }) };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    rpc: async (name: string) => {
      rpcCalls.push(name);
      return { data: null, error: null };
    },
    storage: {
      from(bucket: string) {
        storageCalls.push(bucket);
        return {
          upload: async (path: string) => ({ data: { path }, error: null }),
          download: async () => ({ data: null, error: { message: 'Object not found' } }),
        };
      },
    },
  };

  return { client, tables, accountQueries, meetingUpserts, storageCalls, rpcCalls };
}

function runRetrieval(headers: Record<string, string> = {}) {
  return POST(
    new Request('http://localhost/api/retrieval/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ townId: SALEM_TOWN_ID }),
    }),
  );
}

let fake: ReturnType<typeof createFakeSupabase>;

function useFake(account: Account, accountError: { message: string } | null = null) {
  fake = createFakeSupabase(account, accountError);
  vi.mocked(getSupabaseClient).mockReturnValue(fake.client as unknown as ReturnType<typeof getSupabaseClient>);
}

// A refused request reads nothing beyond the caller's own account and never
// reaches the source, Storage, the database functions or the summary jobs.
function expectNothingRetrieved(allowedTables: string[]) {
  expect(fake.tables.every((table) => allowedTables.includes(table))).toBe(true);
  expect(fake.meetingUpserts).toEqual([]);
  expect(fake.storageCalls).toEqual([]);
  expect(fake.rpcCalls).toEqual([]);
  expect(fetchMeetings).not.toHaveBeenCalled();
  expect(fetchMeetingFiles).not.toHaveBeenCalled();
  expect(downloadFile).not.toHaveBeenCalled();
}

// The error body never names a town or a meeting.
async function expectError(response: Response, status: number, error: string) {
  expect(response.status).toBe(status);
  const body = await response.json();
  expect(body).toEqual({ error });
  expect(JSON.stringify(body)).not.toMatch(/town|meeting|salem/i);
}

describe('Retrieval access control', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
    vi.stubEnv('SUMMARY_API_KEY', '');
    vi.stubEnv('SUMMARY_MODEL', '');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(fetchMeetings).mockResolvedValue({ meetings: [MEETING_1192], complete: true, pagesRead: 1 });
    vi.mocked(fetchMeetingFiles).mockResolvedValue({
      filesByMeeting: new Map([[MEETING_1192.sourceMeetingId, []]]),
      complete: true,
      pagesRead: 1,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns 401 when there is no token', async () => {
    useFake({ account_role: 'System administrator' });

    await expectError(await runRetrieval(), 401, 'Unauthorized');
    expectNothingRetrieved([]);
  });

  it('returns 401 when the Authorization header is not a bearer token', async () => {
    useFake({ account_role: 'System administrator' });

    await expectError(await runRetrieval({ authorization: 'Basic valid-token' }), 401, 'Unauthorized');
    expectNothingRetrieved([]);
  });

  it('returns 401 when the token is invalid or expired', async () => {
    useFake({ account_role: 'System administrator' });

    await expectError(await runRetrieval({ authorization: 'Bearer expired-token' }), 401, 'Invalid or expired token.');
    expectNothingRetrieved([]);
  });

  it('returns 403 when the user is not a system administrator', async () => {
    useFake({ account_role: 'User' });

    const response = await runRetrieval({ authorization: 'Bearer valid-token' });

    await expectError(response, 403, 'Only a system administrator can run retrieval.');
    expect(fake.accountQueries).toEqual([{ column: 'user_id', value: USER_ID }]);
    expectNothingRetrieved(['user_accounts']);
  });

  it('returns 403 when the user has no account row', async () => {
    useFake(null);

    await expectError(
      await runRetrieval({ authorization: 'Bearer valid-token' }),
      403,
      'Only a system administrator can run retrieval.',
    );
    expectNothingRetrieved(['user_accounts']);
  });

  it.each([null, 'system administrator', 'System administrator ', 'Admin'])(
    'returns 403 when the role is %j rather than exactly System administrator',
    async (role) => {
      useFake({ account_role: role });

      await expectError(
        await runRetrieval({ authorization: 'Bearer valid-token' }),
        403,
        'Only a system administrator can run retrieval.',
      );
      expectNothingRetrieved(['user_accounts']);
    },
  );

  it('returns 500 without retrieving when the role cannot be read', async () => {
    useFake(null, { message: 'connection reset' });

    await expectError(await runRetrieval({ authorization: 'Bearer valid-token' }), 500, 'Your access could not be checked.');
    expectNothingRetrieved(['user_accounts']);
  });

  it('checks access before reading the request body', async () => {
    useFake({ account_role: 'User' });

    const response = await POST(
      new Request('http://localhost/api/retrieval/meetings', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer valid-token' },
        body: 'not json',
      }),
    );

    await expectError(response, 403, 'Only a system administrator can run retrieval.');
    expectNothingRetrieved(['user_accounts']);
  });

  it('runs retrieval for a system administrator', async () => {
    useFake({ account_role: 'System administrator' });

    const response = await runRetrieval({ authorization: 'Bearer valid-token' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: 1, complete: true });
    expect(fake.tables[0]).toBe('user_accounts');
    expect(fetchMeetings).toHaveBeenCalledWith('salemma', expect.any(Number));
    expect(fetchMeetingFiles).toHaveBeenCalledWith('salemma', expect.any(Number));
    expect(fake.meetingUpserts).toEqual([expect.objectContaining({ town_id: SALEM_TOWN_ID, source_meeting_id: '1192' })]);
  });
});
