import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeetingFilesListing, MeetingListing, SourceFile, SourceMeeting } from '../../lib/sources/types';

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

// The source client. lib/sources hands these to every town's run.
vi.mock('../../lib/sources/civicclerk', () => ({
  fetchMeetings: vi.fn(),
  fetchMeetingFiles: vi.fn(),
  fetchAgendaItems: vi.fn(),
  downloadFile: vi.fn(),
}));

// Topic tagging after the checks (Task 401.4-7); __tests__/lib/tagPendingMeetings.test.ts covers it.
vi.mock('../../lib/tagPendingMeetings', () => ({
  tagPendingMeetings: vi.fn(),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { downloadFile, fetchMeetingFiles, fetchMeetings } from '../../lib/sources/civicclerk';
import { POST } from '../../app/api/retrieval/scheduled/route';
import { runAllTownChecks } from '../../lib/retrieval/runAllTownChecks';
import { tagPendingMeetings } from '../../lib/tagPendingMeetings';

const TAGGING = { classified: 2, unavailable: 1, agendaChanged: 0, failed: 0 };

type Row = Record<string, unknown>;

const SECRET = 'test-schedule-secret';
const SCHEDULE_URL = 'http://localhost/api/retrieval/scheduled';

// Out of town_id order on purpose. Town 2 is removed, so it is not supported.
const TOWN_ROWS: Row[] = [
  {
    town_id: 3,
    source_account_id: 'town-c',
    meeting_time_zone: 'America/New_York',
    provides_agenda_items: false,
    removed_at: null,
  },
  {
    town_id: 1,
    source_account_id: 'town-a',
    meeting_time_zone: 'America/New_York',
    provides_agenda_items: false,
    removed_at: null,
  },
  {
    town_id: 2,
    source_account_id: 'town-b',
    meeting_time_zone: 'America/New_York',
    provides_agenda_items: false,
    removed_at: '2026-10-01T00:00:00+00:00',
  },
];

const TOWN_COLUMNS = 'town_id, source_account_id, meeting_time_zone, provides_agenda_items';

const MEETING_100: SourceMeeting = {
  sourceMeetingId: '100',
  title: 'Board Meeting',
  sourceBodyId: '1',
  sourceBodyName: 'Board',
  sourceStartTime: '2026-10-08T19:00:00Z',
  location: 'Town Hall',
  onlineLink: null,
  sourceUrl: 'https://example.test/event/100',
};

const FILE_200: SourceFile = {
  sourceFileId: '200',
  fileName: 'Agenda',
  sourceFileType: 'Agenda',
  documentType: 'Agenda',
  downloadUrl: 'https://example.test/files/200',
  sourcePageUrl: 'https://example.test/event/100',
  sizeBytes: null,
};

// Timestamps in the format PostgREST returns (microseconds, +00:00).
function pgTimestamp(ms: number): string {
  return new Date(ms).toISOString().replace('Z', '000+00:00');
}

// Microseconds since the epoch, so the fake compares what Postgres compares.
function toMicros(timestamp: unknown): number {
  const text = String(timestamp);
  const fraction = text.match(/\.(\d+)/)?.[1] ?? '';
  return Date.parse(text.replace(/\.\d+/, '')) * 1000 + Number(fraction.padEnd(6, '0').slice(0, 6));
}

// Fake Supabase client in the style of check-time-record.test.ts. towns
// applies the removed_at filter and the order it is given. source_checks
// applies the table default for started_at, the two table checks, and the
// filters of the running-check read. Every table touched is recorded, so a
// refused request can be shown to have read nothing.
function createFakeSupabase(
  options: { existingChecks?: Row[]; townsFail?: boolean; runningReadFailsFor?: number[] } = {},
) {
  const { existingChecks = [], townsFail = false, runningReadFailsFor = [] } = options;
  const tables: string[] = [];
  const townSelects: string[] = [];
  const checks: Row[] = existingChecks.map((row) => ({ ...row }));
  const meetings = new Map<string, Row>();
  const documents: Row[] = [];
  let nextCheckId = checks.length + 1;
  let nextMeetingId = 501;
  let nextDocumentId = 1;
  let nextAttemptId = 1;

  const client = {
    auth: { getUser: vi.fn() },
    rpc: vi.fn(async () => ({ data: null, error: null })),
    from(table: string) {
      tables.push(table);

      if (table === 'towns') {
        return {
          select: (columns: string) => {
            townSelects.push(columns);
            return {
              is: (column: string, value: unknown) => ({
                order: async (orderColumn: string, orderOptions: { ascending: boolean }) => {
                  if (townsFail) {
                    return { data: null, error: { message: 'towns read failed' } };
                  }
                  const picked = TOWN_ROWS.filter((row) => row[column] === value).map((row) =>
                    Object.fromEntries(columns.split(', ').map((name) => [name, row[name]])),
                  );
                  const sign = orderOptions.ascending ? 1 : -1;
                  picked.sort((a, b) => sign * ((a[orderColumn] as number) - (b[orderColumn] as number)));
                  return { data: picked, error: null };
                },
              }),
            };
          },
        };
      }

      if (table === 'source_checks') {
        return {
          // The running-check read.
          select: () => ({
            eq: (_column: string, townId: number) => ({
              is: (_isColumn: string, _isValue: unknown) => ({
                gte: (_gteColumn: string, since: string) => ({
                  limit: async (count: number) => {
                    if (runningReadFailsFor.includes(townId)) {
                      return { data: null, error: { message: 'source_checks read failed' } };
                    }
                    const data = checks
                      .filter(
                        (row) =>
                          row.town_id === townId && row.ended_at === null && toMicros(row.started_at) >= toMicros(since),
                      )
                      .slice(0, count)
                      .map((row) => ({ check_id: row.check_id }));
                    return { data, error: null };
                  },
                }),
              }),
            }),
          }),
          insert: (row: Row) => ({
            select: () => ({
              single: async () => {
                const stored = {
                  check_id: nextCheckId++,
                  town_id: row.town_id,
                  started_at: pgTimestamp(Date.now()),
                  ended_at: null,
                  changes_found: null,
                };
                checks.push(stored);
                return { data: { check_id: stored.check_id, started_at: stored.started_at }, error: null };
              },
            }),
          }),
          update: (values: Row) => ({
            eq: async (column: string, value: unknown) => {
              for (const row of checks.filter((check) => check[column] === value)) {
                const next = { ...row, ...values };
                if ((next.ended_at === null) !== (next.changes_found === null)) {
                  return { data: null, error: { code: '23514', message: 'ended_at and changes_found together' } };
                }
                if (next.ended_at !== null && toMicros(next.ended_at) < toMicros(next.started_at)) {
                  return { data: null, error: { code: '23514', message: 'ended_at before started_at' } };
                }
                Object.assign(row, values);
              }
              return { data: null, error: null };
            },
          }),
        };
      }

      if (table === 'governing_bodies') {
        return { select: () => ({ eq: () => ({ is: async () => ({ data: [], error: null }) }) }) };
      }

      if (table === 'meetings') {
        return {
          upsert: (rows: Row[]) => {
            const saved = rows.map((row) => {
              const key = `${row.town_id}:${row.source_meeting_id}`;
              const stored = { ...row, meeting_id: meetings.get(key)?.meeting_id ?? nextMeetingId++ };
              meetings.set(key, stored);
              return stored;
            });
            return { select: async () => ({ data: saved.map((row) => ({ meeting_id: row.meeting_id })), error: null }) };
          },
          select: () => ({
            eq: (_column: string, townId: number) => ({
              in: async (_inColumn: string, sourceMeetingIds: string[]) => ({
                data: [...meetings.values()].filter(
                  (row) => row.town_id === townId && sourceMeetingIds.includes(row.source_meeting_id as string),
                ),
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'documents') {
        return {
          insert: (row: Row) => ({
            select: () => ({
              single: async () => {
                const documentId = nextDocumentId++;
                documents.push({ ...row, document_id: documentId });
                return { data: { document_id: documentId }, error: null };
              },
            }),
          }),
          select: () => ({
            eq: (_column: string, townId: number) => ({
              in: async (_inColumn: string, sourceFileIds: string[]) => ({
                data: documents
                  .filter((row) => row.town_id === townId && sourceFileIds.includes(row.source_file_id as string))
                  .map((row) => ({ source_file_id: row.source_file_id })),
                error: null,
              }),
            }),
          }),
        };
      }

      // Attempt 1 for each inserted document. No summary job starts without
      // the summary settings.
      if (table === 'summary_attempts') {
        return {
          insert: (row: Row) => ({
            select: () => ({
              single: async () => ({
                data: { attempt_id: nextAttemptId++, document_id: row.document_id, started_at: pgTimestamp(Date.now()) },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'agenda_items') {
        return { upsert: async () => ({ data: null, error: null }) };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    storage: {
      from: () => ({ upload: async (path: string) => ({ data: { path }, error: null }) }),
    },
  };

  return { client, tables, townSelects, checks, meetings, documents };
}

type FakeSupabase = ReturnType<typeof createFakeSupabase>;
type FakeClient = Parameters<typeof runAllTownChecks>[0];

function meetingListing(): MeetingListing {
  return { meetings: [MEETING_100], complete: true, pagesRead: 1 };
}

function fileListing(): MeetingFilesListing {
  return { filesByMeeting: new Map([[MEETING_100.sourceMeetingId, [FILE_200]]]), complete: true, pagesRead: 1 };
}

async function download(file: SourceFile) {
  return { bytes: new TextEncoder().encode(`%PDF-1.4 file ${file.sourceFileId}`), mimeType: 'application/pdf' };
}

function minutesAgo(minutes: number): string {
  return pgTimestamp(Date.now() - minutes * 60_000);
}

// The accounts the meeting listing was asked for, in call order.
function listedAccounts(): string[] {
  return vi.mocked(fetchMeetings).mock.calls.map(([account]) => account);
}

function checked(townId: number) {
  return { townId, status: 'checked', saved: 1, complete: true };
}

describe('Scheduled source check (SRS-208.1)', () => {
  let fake: FakeSupabase;

  function useFake(options?: Parameters<typeof createFakeSupabase>[0]) {
    fake = createFakeSupabase(options);
    vi.mocked(getSupabaseClient).mockReturnValue(fake.client as unknown as ReturnType<typeof getSupabaseClient>);
  }

  function callScheduled(init: { headers?: Record<string, string>; url?: string; body?: string } = {}) {
    const { headers = { 'x-retrieval-schedule-secret': SECRET }, url = SCHEDULE_URL, body } = init;
    return POST(new Request(url, { method: 'POST', headers, body }));
  }

  function scheduledLogLines(): string[] {
    return [...vi.mocked(console.log).mock.calls, ...vi.mocked(console.error).mock.calls]
      .map(([line]) => String(line))
      .filter((line) => line.startsWith('Scheduled check:'));
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('RETRIEVAL_SCHEDULE_SECRET', SECRET);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
    vi.stubEnv('RETRIEVAL_MAX_PAGES', '');
    // Blank summary settings, so no summary job starts even if the shell sets them.
    vi.stubEnv('SUMMARY_API_KEY', '');
    vi.stubEnv('SUMMARY_MODEL', '');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fetchMeetings).mockImplementation(async () => meetingListing());
    vi.mocked(fetchMeetingFiles).mockImplementation(async () => fileListing());
    vi.mocked(downloadFile).mockImplementation(download);
    vi.mocked(tagPendingMeetings).mockResolvedValue(TAGGING);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('access', () => {
    it.each([
      ['empty', ''],
      ['blank', '   '],
    ] as const)('answers 500 before any database read when the secret is %s', async (_case, value) => {
      vi.stubEnv('RETRIEVAL_SCHEDULE_SECRET', value);
      useFake();

      const response = await callScheduled();

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'The scheduled check is not configured.' });
      expect(getSupabaseClient).not.toHaveBeenCalled();
      expect(fake.tables).toEqual([]);
      expect(fetchMeetings).not.toHaveBeenCalled();
    });

    it.each([
      ['missing', {}],
      ['wrong', { 'x-retrieval-schedule-secret': 'not-the-secret' }],
      ['empty', { 'x-retrieval-schedule-secret': '' }],
    ] as const)('answers 401 before any database read when the header is %s', async (_case, headers) => {
      useFake();

      const response = await callScheduled({ headers });

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized.' });
      expect(getSupabaseClient).not.toHaveBeenCalled();
      expect(fake.tables).toEqual([]);
      expect(fetchMeetings).not.toHaveBeenCalled();
    });

    it('needs no sign-in with the right secret', async () => {
      useFake();

      const response = await callScheduled();

      expect(response.status).toBe(200);
      expect(fake.client.auth.getUser).not.toHaveBeenCalled();
      expect(fake.tables).not.toContain('user_accounts');
    });

    it('answers 500 when the service role key is not set', async () => {
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
      useFake();

      const response = await callScheduled();

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Supabase credentials are not configured.' });
      expect(fake.tables).toEqual([]);
    });
  });

  describe('every supported town', () => {
    it('checks every town with removed_at null in town_id order, and not a removed town', async () => {
      useFake();

      const response = await callScheduled();

      expect(response.status).toBe(200);
      expect(listedAccounts()).toEqual(['town-a', 'town-c']);
      expect(vi.mocked(fetchMeetingFiles).mock.calls.map(([account]) => account)).toEqual(['town-a', 'town-c']);
      expect(fake.townSelects).toEqual([TOWN_COLUMNS]);
      expect(fake.checks.map((row) => row.town_id)).toEqual([1, 3]);
      expect(await response.json()).toEqual({
        towns: [checked(1), checked(3)],
        totals: { towns: 2, checked: 2, skipped: 0, failed: 0, saved: 2 },
        tagging: TAGGING,
      });
    });

    it('closes a source_checks row for each checked town', async () => {
      useFake();

      await callScheduled();

      expect(fake.checks).toHaveLength(2);
      for (const row of fake.checks) {
        expect(row.ended_at).not.toBeNull();
        expect(row.changes_found).toBe(true);
        expect(toMicros(row.ended_at)).toBeGreaterThanOrEqual(toMicros(row.started_at));
      }
    });

    it('goes on to the next town when one town fails', async () => {
      vi.mocked(fetchMeetings).mockImplementation(async (account: string) => {
        if (account === 'town-a') throw new Error('listing down');
        return meetingListing();
      });
      useFake();

      const response = await callScheduled();

      expect(response.status).toBe(200);
      expect(listedAccounts()).toEqual(['town-a', 'town-c']);
      expect(await response.json()).toEqual({
        towns: [{ townId: 1, status: 'failed' }, checked(3)],
        totals: { towns: 2, checked: 1, skipped: 0, failed: 1, saved: 1 },
        tagging: TAGGING,
      });
      // The failed town's check is still closed.
      expect(fake.checks.map((row) => [row.town_id, row.ended_at !== null])).toEqual([
        [1, true],
        [3, true],
      ]);
      expect(fake.meetings.has('3:100')).toBe(true);
    });

    it('goes on to the next town when a town throws before its run', async () => {
      useFake({ runningReadFailsFor: [1] });

      const response = await callScheduled();

      expect(await response.json()).toEqual({
        towns: [{ townId: 1, status: 'failed' }, checked(3)],
        totals: { towns: 2, checked: 1, skipped: 0, failed: 1, saved: 1 },
        tagging: TAGGING,
      });
      expect(listedAccounts()).toEqual(['town-c']);
      expect(fake.checks.map((row) => row.town_id)).toEqual([3]);
    });

    it('answers 500 with a fixed message when the town list cannot be read', async () => {
      useFake({ townsFail: true });

      const response = await callScheduled();

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Could not read the town list.' });
      expect(fake.tables).toEqual(['towns']);
      expect(fetchMeetings).not.toHaveBeenCalled();
      expect(tagPendingMeetings).not.toHaveBeenCalled();
    });

    it('tags Pending meetings once, after every town is checked (Task 401.4-7)', async () => {
      useFake();
      vi.mocked(tagPendingMeetings).mockImplementation(async () => {
        // Both towns' checks are closed before tagging starts.
        expect(fake.checks.map((row) => row.ended_at !== null)).toEqual([true, true]);
        return TAGGING;
      });

      const response = await callScheduled();

      expect(tagPendingMeetings).toHaveBeenCalledTimes(1);
      expect(vi.mocked(tagPendingMeetings).mock.calls[0][0]).toBe(fake.client);
      expect((await response.json()).tagging).toEqual(TAGGING);
    });

    it('still answers with the check results when the Pending meetings cannot be read', async () => {
      useFake();
      vi.mocked(tagPendingMeetings).mockResolvedValue(null);

      const response = await callScheduled();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        towns: [checked(1), checked(3)],
        totals: { towns: 2, checked: 2, skipped: 0, failed: 0, saved: 2 },
        tagging: null,
      });
    });
  });

  describe('running checks', () => {
    it('skips a town with a running check started in the last 60 minutes, and checks one started longer ago', async () => {
      useFake({
        existingChecks: [
          { check_id: 1, town_id: 1, started_at: minutesAgo(30), ended_at: null, changes_found: null },
          { check_id: 2, town_id: 3, started_at: minutesAgo(90), ended_at: null, changes_found: null },
        ],
      });

      const response = await callScheduled();

      expect(await response.json()).toEqual({
        towns: [{ townId: 1, status: 'skipped' }, checked(3)],
        totals: { towns: 2, checked: 1, skipped: 1, failed: 0, saved: 1 },
        tagging: TAGGING,
      });
      expect(listedAccounts()).toEqual(['town-c']);
      // No new row for the skipped town; the old rows are only read.
      expect(fake.checks.map((row) => [row.check_id, row.town_id, row.ended_at === null])).toEqual([
        [1, 1, true],
        [2, 3, true],
        [3, 3, false],
      ]);
    });

    it('does not skip a town whose last check has ended', async () => {
      useFake({
        existingChecks: [
          { check_id: 1, town_id: 1, started_at: minutesAgo(10), ended_at: minutesAgo(5), changes_found: false },
        ],
      });

      const response = await callScheduled();

      expect((await response.json()).totals).toMatchObject({ checked: 2, skipped: 0 });
      expect(listedAccounts()).toEqual(['town-a', 'town-c']);
    });

    it('measures the 60 minutes from the clock it is given', async () => {
      const now = new Date('2026-11-02T12:00:00.000Z');
      useFake({
        existingChecks: [
          { check_id: 1, town_id: 1, started_at: '2026-11-02T11:01:00.000000+00:00', ended_at: null, changes_found: null },
          { check_id: 2, town_id: 3, started_at: '2026-11-02T10:59:00.000000+00:00', ended_at: null, changes_found: null },
        ],
      });

      const result = await runAllTownChecks(fake.client as unknown as FakeClient, { maxPages: 2, now: () => now });

      expect(result).toEqual({
        ok: true,
        towns: [{ townId: 1, status: 'skipped' }, checked(3)],
        totals: { towns: 2, checked: 1, skipped: 1, failed: 0, saved: 1 },
      });
    });
  });

  describe('page bound', () => {
    it.each([
      ['3', 3],
      ['', 20],
      ['99', 20],
    ] as const)('uses RETRIEVAL_MAX_PAGES %j as the bound %i', async (setting, bound) => {
      vi.stubEnv('RETRIEVAL_MAX_PAGES', setting);
      useFake();

      await callScheduled();

      expect(vi.mocked(fetchMeetings).mock.calls.map(([, maxPages]) => maxPages)).toEqual([bound, bound]);
      expect(vi.mocked(fetchMeetingFiles).mock.calls.map(([, maxPages]) => maxPages)).toEqual([bound, bound]);
    });

    it('ignores a body and query values sent with the request', async () => {
      vi.stubEnv('RETRIEVAL_MAX_PAGES', '3');
      useFake();

      const response = await callScheduled({
        url: `${SCHEDULE_URL}?townId=2&maxPages=50`,
        headers: { 'x-retrieval-schedule-secret': SECRET, 'content-type': 'application/json' },
        body: JSON.stringify({ townId: 2, maxPages: 50 }),
      });

      expect(response.status).toBe(200);
      expect(listedAccounts()).toEqual(['town-a', 'town-c']);
      expect(vi.mocked(fetchMeetings).mock.calls.map(([, maxPages]) => maxPages)).toEqual([3, 3]);
      expect(fake.checks.map((row) => row.town_id)).toEqual([1, 3]);
    });
  });

  describe('counts only', () => {
    it('answers and logs counts only, with no error message, title or secret', async () => {
      vi.mocked(fetchMeetings).mockImplementation(async (account: string) => {
        if (account === 'town-a') throw new Error('listing down');
        return meetingListing();
      });
      useFake();

      const response = await callScheduled();
      const text = await response.text();

      expect(JSON.parse(text)).toEqual({
        towns: [{ townId: 1, status: 'failed' }, checked(3)],
        totals: { towns: 2, checked: 1, skipped: 0, failed: 1, saved: 1 },
        tagging: TAGGING,
      });
      for (const forbidden of ['listing down', MEETING_100.title, SECRET, 'town-a', 'town-c', 'example.test']) {
        expect(text).not.toContain(forbidden);
      }

      expect(scheduledLogLines()).toEqual([
        'Scheduled check: town 1 failed',
        'Scheduled check: town 3 checked, saved 1, complete true',
        'Scheduled check: 2 towns, checked 1, skipped 0, failed 1, saved 1',
      ]);
    });
  });

  describe('workflow file', () => {
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/scheduled-check.yml'), 'utf8');

    it('runs every 3 hours and by hand', () => {
      expect(workflow).toContain("cron: '0 */3 * * *'");
      expect(workflow).toMatch(/^\s+workflow_dispatch:/m);
    });

    it('sends a single POST to the scheduled route with no retry', () => {
      expect(workflow.match(/--request POST/g)).toHaveLength(1);
      expect(workflow.match(/\/api\/retrieval\/scheduled/g)).toHaveLength(1);
      expect(workflow).not.toMatch(/-X\s*POST/);
      expect(workflow).not.toContain('--retry');
      expect(workflow).toContain('--fail-with-body');
      expect(workflow).toContain('--max-time 1800');
      expect(workflow).toContain('x-retrieval-schedule-secret: $RETRIEVAL_SCHEDULE_SECRET');
    });

    it('never traces commands or echoes the secret', () => {
      expect(workflow).not.toContain('set -x');
      expect(workflow).not.toContain('--verbose');
      expect(workflow).not.toMatch(/curl[^\n]*\s-v\b/);
      expect(workflow).not.toMatch(/echo[^\n]*\$\{?RETRIEVAL_SCHEDULE_SECRET/);
    });
  });
});
