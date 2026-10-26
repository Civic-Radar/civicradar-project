import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeetingFilesListing, MeetingListing, SourceFile, SourceMeeting } from '../../lib/sources/types';

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

// The route tests mock the source client. The direct tests pass their own
// source functions to runTownRetrieval.
vi.mock('../../lib/sources/civicclerk', () => ({
  fetchMeetings: vi.fn(),
  fetchMeetingFiles: vi.fn(),
  downloadFile: vi.fn(),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { downloadFile, fetchMeetingFiles, fetchMeetings } from '../../lib/sources/civicclerk';
import { POST } from '../../app/api/retrieval/meetings/route';
import { runTownRetrieval, type RetrievalSource } from '../../lib/retrieval/runTownRetrieval';

type Row = Record<string, unknown>;

const TOWN_A = { town_id: 1, source_account_id: 'town-a', meeting_time_zone: 'America/New_York' };
const TOWN_B = { town_id: 2, source_account_id: 'town-b', meeting_time_zone: 'America/New_York' };
const TOWNS: Record<number, typeof TOWN_A> = { [TOWN_A.town_id]: TOWN_A, [TOWN_B.town_id]: TOWN_B };

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

// 2:00 PM in America/New_York (EDT) on the meeting day.
const TWO_PM = '2026-10-08T18:00:00.000Z';
// A database started_at a little before 2:00 PM, with microseconds.
const STARTED_BEFORE_TWO_PM = '2026-10-08T17:59:12.345678+00:00';

// Timestamps in the format PostgREST returns (microseconds, +00:00).
function pgTimestamp(ms: number): string {
  return new Date(ms).toISOString().replace('Z', '000+00:00');
}

// Microseconds since the epoch, so the fake's table check compares what
// Postgres compares.
function toMicros(timestamp: unknown): number {
  const text = String(timestamp);
  const fraction = text.match(/\.(\d+)/)?.[1] ?? '';
  return Date.parse(text.replace(/\.\d+/, '')) * 1000 + Number(fraction.padEnd(6, '0').slice(0, 6));
}

// Fake Supabase client for the direct runs and the route. source_checks
// applies the table default for started_at and the two table checks from
// supabase/schema.sql. Every table touched is recorded, so a refused request
// can be shown to have reached no check row.
function createFakeSupabase(options: { accountRole?: string; startedAt?: () => string } = {}) {
  const { accountRole = 'System administrator', startedAt = () => pgTimestamp(Date.now()) } = options;
  const tables: string[] = [];
  const checks: Row[] = [];
  const checkUpdates: { values: Row; column: string; value: unknown }[] = [];
  const meetings = new Map<string, Row>();
  const documents: Row[] = [];
  let nextCheckId = 1;
  let nextMeetingId = 501;
  let nextDocumentId = 1;
  let nextAttemptId = 1;

  const client = {
    auth: {
      getUser: async (token: string) =>
        token === 'admin-token'
          ? { data: { user: { id: 'admin-user' } }, error: null }
          : { data: { user: null }, error: { message: 'invalid JWT' } },
    },
    from(table: string) {
      tables.push(table);

      if (table === 'user_accounts') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { account_role: accountRole }, error: null }) }),
          }),
        };
      }

      if (table === 'towns') {
        return {
          select: () => ({
            eq: (_column: string, townId: number) => ({
              is: () => ({ maybeSingle: async () => ({ data: TOWNS[townId] ?? null, error: null }) }),
            }),
          }),
        };
      }

      if (table === 'source_checks') {
        return {
          insert: (row: Row) => ({
            select: () => ({
              single: async () => {
                const stored = {
                  check_id: nextCheckId++,
                  town_id: row.town_id,
                  started_at: startedAt(),
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
              checkUpdates.push({ values: { ...values }, column, value });
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

      throw new Error(`Unexpected table: ${table}`);
    },
    storage: {
      from: () => ({ upload: async (path: string) => ({ data: { path }, error: null }) }),
    },
  };

  return { client, tables, checks, checkUpdates, meetings, documents };
}

type FakeSupabase = ReturnType<typeof createFakeSupabase>;
type FakeClient = Parameters<typeof runTownRetrieval>[0];

function meetingListing(): MeetingListing {
  return { meetings: [MEETING_100], complete: true, pagesRead: 1 };
}

function fileListing(): MeetingFilesListing {
  return { filesByMeeting: new Map([[MEETING_100.sourceMeetingId, [FILE_200]]]), complete: true, pagesRead: 1 };
}

async function download(file: SourceFile) {
  return { bytes: new TextEncoder().encode(`%PDF-1.4 file ${file.sourceFileId}`), mimeType: 'application/pdf' };
}

// Source functions for a direct run: one meeting with one file, both pages
// read. Each can be replaced.
function createSource(overrides: Partial<RetrievalSource> = {}): RetrievalSource {
  return {
    fetchMeetings: async () => meetingListing(),
    fetchMeetingFiles: async () => fileListing(),
    downloadFile: download,
    ...overrides,
  };
}

function run(fake: FakeSupabase, town: typeof TOWN_A, source: RetrievalSource, now?: () => Date) {
  return runTownRetrieval(fake.client as unknown as FakeClient, town, source, { maxPages: 2, now });
}

describe('Check time record (SRS-222.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
    // Blank summary settings, so no summary job starts even if the shell sets them.
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('SUMMARY_MODEL', '');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('runTownRetrieval', () => {
    it('creates one row before the first source read, then ends it with changes_found set', async () => {
      const fake = createFakeSupabase();
      let checksAtFirstRead: Row[] | null = null;
      const source = createSource({
        fetchMeetings: async () => {
          checksAtFirstRead = fake.checks.map((row) => ({ ...row }));
          return meetingListing();
        },
      });

      const result = await run(fake, TOWN_A, source);

      expect(result).toEqual({ ok: true, saved: 1, complete: true });
      expect(checksAtFirstRead).toEqual([expect.objectContaining({ town_id: TOWN_A.town_id, ended_at: null })]);
      expect(fake.checks).toHaveLength(1);
      expect(fake.checks[0]).toMatchObject({ town_id: TOWN_A.town_id, changes_found: true });
      expect(fake.checks[0].ended_at).not.toBeNull();
      expect(toMicros(fake.checks[0].ended_at)).toBeGreaterThanOrEqual(toMicros(fake.checks[0].started_at));
      expect(fake.checkUpdates).toHaveLength(1);
    });

    it('records started_at as ended_at when the app clock trails the database clock', async () => {
      const fake = createFakeSupabase({ startedAt: () => STARTED_BEFORE_TWO_PM });

      await run(fake, TOWN_A, createSource(), () => new Date('2026-10-08T17:59:12.345Z'));

      expect(fake.checks[0].ended_at).toBe(STARTED_BEFORE_TWO_PM);
      expect(fake.checks[0].changes_found).toBe(true);
    });

    it('records exactly 2:00 PM when the check ends at 2:00 PM', async () => {
      const fake = createFakeSupabase({ startedAt: () => STARTED_BEFORE_TWO_PM });

      await run(fake, TOWN_A, createSource(), () => new Date(TWO_PM));

      expect(fake.checkUpdates).toEqual([
        { values: { ended_at: TWO_PM, changes_found: true }, column: 'check_id', value: 1 },
      ]);
      expect(fake.checks[0].ended_at).toBe(TWO_PM);
      const localTime = new Intl.DateTimeFormat('en-US', {
        timeZone: TOWN_A.meeting_time_zone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(new Date(fake.checks[0].ended_at as string));
      expect(localTime).toBe('14:00');
    });

    it.each([
      [
        'the meeting listing',
        { fetchMeetings: async () => Promise.reject(new Error('listing down')) },
        { ok: false, status: 502, error: 'listing down' },
      ],
      [
        'the file listing',
        { fetchMeetingFiles: async () => Promise.reject(new Error('listing down')) },
        { ok: false, status: 502, error: 'Saved 1 meetings, but listing their documents failed.' },
      ],
    ] as const)('still ends its check when %s throws', async (_case, overrides, expected) => {
      const fake = createFakeSupabase();

      const result = await run(fake, TOWN_A, createSource(overrides));

      expect(result).toEqual(expected);
      expect(fake.checks).toHaveLength(1);
      expect(fake.checks[0].ended_at).not.toBeNull();
      expect(fake.checks[0].changes_found).toBe(false);
    });

    it('gives each town its own row', async () => {
      const fake = createFakeSupabase();

      await run(fake, TOWN_A, createSource());
      await run(fake, TOWN_B, createSource());

      expect(fake.checks.map((row) => [row.check_id, row.town_id])).toEqual([
        [1, TOWN_A.town_id],
        [2, TOWN_B.town_id],
      ]);
      expect(fake.checkUpdates.map((update) => update.value)).toEqual([1, 2]);
      expect(fake.checks.every((row) => row.ended_at !== null && row.changes_found === true)).toBe(true);
    });

    it('sets changes_found false when a later run stores nothing new', async () => {
      const fake = createFakeSupabase();

      await run(fake, TOWN_A, createSource());
      const result = await run(fake, TOWN_A, createSource());

      expect(result).toEqual({ ok: true, saved: 1, complete: true });
      expect(fake.documents).toHaveLength(1);
      expect(fake.checks.map((row) => row.changes_found)).toEqual([true, false]);
      expect(fake.checks[1].ended_at).not.toBeNull();
    });

    it('sets changes_found false when a file download fails, even with a new meeting', async () => {
      const fake = createFakeSupabase();
      const source = createSource({ downloadFile: async () => Promise.reject(new Error('download failed')) });

      const result = await run(fake, TOWN_A, source);

      expect(result).toEqual({ ok: true, saved: 1, complete: true });
      expect(fake.meetings.size).toBe(1);
      expect(fake.documents).toEqual([]);
      expect(fake.checks[0].changes_found).toBe(false);
      expect(fake.checks[0].ended_at).not.toBeNull();
    });
  });

  describe('retrieval route', () => {
    let fake: FakeSupabase;

    function useFake(accountRole?: string) {
      fake = createFakeSupabase({ accountRole });
      vi.mocked(getSupabaseClient).mockReturnValue(fake.client as unknown as ReturnType<typeof getSupabaseClient>);
    }

    function runRetrieval(headers: Record<string, string> = {}) {
      return POST(
        new Request('http://localhost/api/retrieval/meetings', {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify({ townId: TOWN_A.town_id }),
        }),
      );
    }

    beforeEach(() => {
      vi.mocked(fetchMeetings).mockResolvedValue(meetingListing());
      vi.mocked(fetchMeetingFiles).mockResolvedValue(fileListing());
      vi.mocked(downloadFile).mockImplementation(download);
    });

    it('creates one row for an allowed request and returns the same response', async () => {
      useFake();

      const response = await runRetrieval({ authorization: 'Bearer admin-token' });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ saved: 1, complete: true });
      expect(fake.checks).toHaveLength(1);
      expect(fake.checks[0]).toMatchObject({ town_id: TOWN_A.town_id, changes_found: true });
      expect(fake.checks[0].ended_at).not.toBeNull();
    });

    it.each([
      ['there is no token', undefined, {}, 401],
      ['the user is not a system administrator', 'User', { authorization: 'Bearer admin-token' }, 403],
    ] as const)('creates no row when %s', async (_case, accountRole, headers, status) => {
      useFake(accountRole);

      const response = await runRetrieval(headers);

      expect(response.status).toBe(status);
      expect(fake.checks).toEqual([]);
      expect(fake.tables).not.toContain('source_checks');
      expect(fetchMeetings).not.toHaveBeenCalled();
    });
  });
});
