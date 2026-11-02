import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeetingFilesListing, MeetingListing, SourceFile, SourceMeeting } from '../../lib/sources/types';
import { runTownRetrieval, type RetrievalSource } from '../../lib/retrieval/runTownRetrieval';

type Row = Record<string, unknown>;

const TOWN = {
  town_id: 1,
  source_account_id: 'town-a',
  meeting_time_zone: 'America/New_York',
  provides_agenda_items: false,
};
const AGENDA_TOWN = { ...TOWN, provides_agenda_items: true };

const MEETING_100: SourceMeeting = {
  sourceMeetingId: '100',
  title: 'Board Meeting',
  sourceBodyId: '1',
  sourceBodyName: 'Board',
  sourceStartTime: '2026-10-08T19:00:00Z',
  location: 'Town Hall',
  onlineLink: null,
  sourceUrl: 'https://example.test/event/100',
  agendaRef: 'agenda-100',
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

// Fake Supabase client covering what one retrieval run touches. events
// records, in order, when the check row is closed and when the baseline
// function is called, so a test can show the call comes after the check ends.
function createFakeSupabase(options: { rpcError?: string } = {}) {
  const events: string[] = [];
  const rpcCalls: { name: string; args: Row }[] = [];
  const meetings = new Map<string, Row>();
  let nextMeetingId = 501;
  let nextDocumentId = 1;

  const client = {
    from(table: string) {
      if (table === 'source_checks') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { check_id: 7, started_at: '2026-10-08T17:59:12.345678+00:00' }, error: null }),
            }),
          }),
          update: () => ({
            eq: async () => {
              events.push('check ended');
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
          insert: () => ({
            select: () => ({ single: async () => ({ data: { document_id: nextDocumentId++ }, error: null }) }),
          }),
          select: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }),
        };
      }

      if (table === 'summary_attempts') {
        return {
          insert: (row: Row) => ({
            select: () => ({
              single: async () => ({
                data: { attempt_id: 1, document_id: row.document_id, started_at: new Date().toISOString() },
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
    async rpc(name: string, args: Row) {
      events.push('baseline update');
      rpcCalls.push({ name, args });
      return options.rpcError
        ? { data: null, error: { message: options.rpcError } }
        : { data: null, error: null };
    },
    storage: {
      from: () => ({ upload: async (path: string) => ({ data: { path }, error: null }) }),
    },
  };

  return { client, events, rpcCalls };
}

type FakeSupabase = ReturnType<typeof createFakeSupabase>;
type FakeClient = Parameters<typeof runTownRetrieval>[0];

function meetingListing(complete = true): MeetingListing {
  return { meetings: [MEETING_100], complete, pagesRead: 1 };
}

function fileListing(complete = true): MeetingFilesListing {
  return { filesByMeeting: new Map([[MEETING_100.sourceMeetingId, [FILE_200]]]), complete, pagesRead: 1 };
}

// Source functions for a run in which every read succeeds. Each can be replaced.
function createSource(overrides: Partial<RetrievalSource> = {}): RetrievalSource {
  return {
    fetchMeetings: async () => meetingListing(),
    fetchMeetingFiles: async () => fileListing(),
    fetchAgendaItems: async () => [],
    downloadFile: async (file: SourceFile) => ({
      bytes: new TextEncoder().encode(`%PDF-1.4 file ${file.sourceFileId}`),
      mimeType: 'application/pdf',
    }),
    ...overrides,
  };
}

function run(fake: FakeSupabase, town: typeof TOWN, source: RetrievalSource) {
  return runTownRetrieval(fake.client as unknown as FakeClient, town, source, { maxPages: 2 });
}

describe('Comparison baseline update (SRS-404.5)', () => {
  beforeEach(() => {
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

  it('advances the baselines once, after the check row is closed, when every read succeeds', async () => {
    const fake = createFakeSupabase();

    const result = await run(fake, TOWN, createSource());

    expect(result).toEqual({ ok: true, saved: 1, complete: true });
    expect(fake.rpcCalls).toEqual([{ name: 'process_successful_check', args: { p_check_id: 7 } }]);
    expect(fake.events).toEqual(['check ended', 'baseline update']);
  });

  it('advances the baselines for a town with agenda items when every agenda listing succeeds', async () => {
    const fake = createFakeSupabase();

    await run(fake, AGENDA_TOWN, createSource());

    expect(fake.rpcCalls).toHaveLength(1);
  });

  // Each case is one failed or partial read in an otherwise successful run.
  const unsuccessfulRuns: [string, typeof TOWN, Partial<RetrievalSource>][] = [
    ['the meeting listing stopped before its last page', TOWN, { fetchMeetings: async () => meetingListing(false) }],
    ['the file listing stopped before its last page', TOWN, { fetchMeetingFiles: async () => fileListing(false) }],
    [
      'a file download failed',
      TOWN,
      {
        downloadFile: async () => {
          throw new Error('download timed out');
        },
      },
    ],
    [
      'an agenda listing failed',
      AGENDA_TOWN,
      {
        fetchAgendaItems: async () => {
          throw new Error('agenda request failed');
        },
      },
    ],
    [
      'the file listing failed',
      TOWN,
      {
        fetchMeetingFiles: async () => {
          throw new Error('listing failed');
        },
      },
    ],
    [
      'the meeting listing failed',
      TOWN,
      {
        fetchMeetings: async () => {
          throw new Error('listing failed');
        },
      },
    ],
  ];

  it.each(unsuccessfulRuns)('keeps the previous baselines when %s (SRS-404.9)', async (_case, town, overrides) => {
    const fake = createFakeSupabase();

    await run(fake, town, createSource(overrides));

    expect(fake.events).toContain('check ended');
    expect(fake.rpcCalls).toEqual([]);
  });

  it('returns the same response and logs the failure when the baseline update fails', async () => {
    const fake = createFakeSupabase({ rpcError: 'connection reset' });

    const result = await run(fake, TOWN, createSource());

    expect(result).toEqual({ ok: true, saved: 1, complete: true });
    expect(console.error).toHaveBeenCalledWith('Baseline update: town 1 check 7 failed: connection reset');
  });
});
