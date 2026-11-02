import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeetingFilesListing, MeetingListing, SourceFile, SourceMeeting } from '../../lib/sources/types';

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

// The route tests mock the source client. Its agenda listing is backed by the
// real one (loaded with importActual) with fetch stubbed, so nothing goes live.
vi.mock('../../lib/sources/civicclerk', () => ({
  fetchMeetings: vi.fn(),
  fetchMeetingFiles: vi.fn(),
  fetchAgendaItems: vi.fn(),
  downloadFile: vi.fn(),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { downloadFile, fetchAgendaItems, fetchMeetingFiles, fetchMeetings } from '../../lib/sources/civicclerk';
import { POST } from '../../app/api/retrieval/meetings/route';

type CivicClerkClient = typeof import('../../lib/sources/civicclerk');
type Row = Record<string, unknown>;

// A hand-written agenda in the source's field shape, with invented content:
// two sections, one nested child, one deleted entry and one long HTML name
// with a table and &nbsp;. Five entries are kept.
const FIXTURE_PATH = join(__dirname, '../fixtures/civicclerk-agenda-sample.json');
const FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as Row;

// Town A is verified to provide agenda items; Town B is not.
const TOWN_A = {
  town_id: 1,
  source_account_id: 'town-a',
  meeting_time_zone: 'America/New_York',
  provides_agenda_items: true,
};
const TOWN_B = {
  town_id: 2,
  source_account_id: 'town-b',
  meeting_time_zone: 'America/New_York',
  provides_agenda_items: false,
};
const TOWNS: Record<number, typeof TOWN_A> = { [TOWN_A.town_id]: TOWN_A, [TOWN_B.town_id]: TOWN_B };

const AGENDA_URL = (agendaRef: string) => `https://town-a.api.civicclerk.com/v1/Meetings/${agendaRef}`;

function makeMeeting(sourceMeetingId: string, agendaRef: string | null): SourceMeeting {
  return {
    sourceMeetingId,
    title: 'Board Meeting',
    sourceBodyId: '1',
    sourceBodyName: 'Board',
    sourceStartTime: '2026-10-08T19:00:00Z',
    location: 'Town Hall',
    onlineLink: null,
    sourceUrl: `https://example.test/event/${sourceMeetingId}`,
    agendaRef,
  };
}

const MEETING_100 = makeMeeting('100', '9001');
const MEETING_200 = makeMeeting('200', '9002');

const FILE_300: SourceFile = {
  sourceFileId: '300',
  fileName: 'Agenda',
  sourceFileType: 'Agenda',
  documentType: 'Agenda',
  downloadUrl: 'https://example.test/files/300',
  sourcePageUrl: 'https://example.test/event/200',
  sizeBytes: null,
};

// The five kept entries, depth first, as plain text.
const EXPECTED_ITEMS = [
  { sourceItemId: '101', sortOrder: 1, title: 'Call to Order', itemText: 'Call to Order' },
  { sourceItemId: '102', sortOrder: 2, title: 'Old Business', itemText: 'Old Business' },
  {
    sourceItemId: '103',
    sortOrder: 3,
    title: 'Vote on the sample park bench order',
    itemText: 'Vote on the sample park bench order\n\nDraft order attached & ready.',
  },
  {
    sourceItemId: '105',
    sortOrder: 4,
    title: 'Sample budget transfer request',
    itemText: [
      'Sample budget transfer request',
      'Fund Amount',
      'Parks $1,000',
      'Roads  <none>',
      `Ordered: "Approved" 'as read'`,
      'Second line',
    ].join('\n'),
  },
  { sourceItemId: '106', sortOrder: 5, title: 'Adjournment', itemText: 'Adjournment' },
];

// Serves agendas by agenda id. A missing id answers 500.
function stubAgendas(agendas: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    for (const [agendaRef, body] of Object.entries(agendas)) {
      if (url === AGENDA_URL(agendaRef)) {
        return new Response(JSON.stringify(body), { status: 200 });
      }
    }
    return new Response('Server error', { status: 500 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// Fake Supabase client for the route. agenda_items applies the table's unique
// key (meeting_id, source_item_id): an upsert on it updates the sent columns
// and keeps every other column, so baselined_at and removed_at stay unless
// they are sent. Every table touched is recorded.
function createFakeSupabase() {
  const tables: string[] = [];
  const meetings = new Map<string, Row>();
  const documents: Row[] = [];
  const agendaItems: Row[] = [];
  const agendaUpserts: { rows: Row[]; onConflict: string | undefined }[] = [];
  let nextMeetingId = 501;
  let nextDocumentId = 1;
  let nextAgendaItemId = 1;

  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'admin-user' } }, error: null }) },
    from(table: string) {
      tables.push(table);

      if (table === 'user_accounts') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { account_role: 'System administrator' }, error: null }) }),
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
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { check_id: 1, started_at: new Date().toISOString() }, error: null }),
            }),
          }),
          update: () => ({ eq: async () => ({ data: null, error: null }) }),
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

      if (table === 'agenda_items') {
        return {
          upsert: async (rows: Row[], options?: { onConflict?: string }) => {
            agendaUpserts.push({ rows: rows.map((row) => ({ ...row })), onConflict: options?.onConflict });
            if (options?.onConflict !== 'meeting_id,source_item_id') {
              return { data: null, error: { code: '42P10', message: 'no unique constraint matching' } };
            }
            for (const row of rows) {
              const existing = agendaItems.find(
                (item) => item.meeting_id === row.meeting_id && item.source_item_id === row.source_item_id,
              );
              if (existing) {
                Object.assign(existing, row);
              } else {
                agendaItems.push({
                  agenda_item_id: nextAgendaItemId++,
                  baselined_at: null,
                  removed_at: null,
                  ...row,
                });
              }
            }
            return { data: null, error: null };
          },
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
                data: { attempt_id: 1, document_id: row.document_id, started_at: new Date().toISOString() },
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

  return { client, tables, meetings, documents, agendaItems, agendaUpserts };
}

type FakeSupabase = ReturnType<typeof createFakeSupabase>;

describe('Agenda item retrieval (SRS-220.9)', () => {
  let real: CivicClerkClient;

  beforeAll(async () => {
    real = await vi.importActual<CivicClerkClient>('../../lib/sources/civicclerk');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('source client', () => {
    it('lists the five kept entries depth first, in order, as plain text, with one request', async () => {
      const fetchMock = stubAgendas({ '9001': FIXTURE });

      const items = await real.fetchAgendaItems('town-a', '9001');

      expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([AGENDA_URL('9001')]);
      expect(items).toEqual(EXPECTED_ITEMS);
    });

    it('throws on a failed request, so a failed listing is never "no agenda items"', async () => {
      stubAgendas({});

      await expect(real.fetchAgendaItems('town-a', '9001')).rejects.toThrow('status 500');
    });

    it('throws when the response has no item list', async () => {
      stubAgendas({ '9001': { id: 9001, agendaIsPublish: true } });

      await expect(real.fetchAgendaItems('town-a', '9001')).rejects.toThrow('without an item list');
    });

    it('returns no items for an agenda that is not published', async () => {
      stubAgendas({ '9001': { ...FIXTURE, agendaIsPublish: false } });

      await expect(real.fetchAgendaItems('town-a', '9001')).resolves.toEqual([]);
    });

    it('sets agendaRef from agendaId only when the event has an agenda', async () => {
      const page = {
        value: [
          { id: 100, eventName: 'Board Meeting', hasAgenda: true, agendaId: 9001, publishedFiles: [] },
          { id: 101, eventName: 'Board Meeting', hasAgenda: false, agendaId: 0, publishedFiles: [] },
          { id: 102, eventName: 'Board Meeting', hasAgenda: true, agendaId: 0, publishedFiles: [] },
        ],
      };
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(page), { status: 200 })));

      const listing = await real.fetchMeetings('town-a', 1);

      expect(listing.meetings.map((meeting) => meeting.agendaRef)).toEqual(['9001', null, null]);
    });
  });

  describe('retrieval route', () => {
    let fake: FakeSupabase;

    function runRetrieval(townId: number) {
      return POST(
        new Request('http://localhost/api/retrieval/meetings', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer admin-token' },
          body: JSON.stringify({ townId }),
        }),
      );
    }

    function useListing(meetings: SourceMeeting[], filesByMeeting: [string, SourceFile[]][] = []) {
      const listing: MeetingListing = { meetings, complete: true, pagesRead: 1 };
      const files: MeetingFilesListing = {
        filesByMeeting: new Map([...meetings.map((m): [string, SourceFile[]] => [m.sourceMeetingId, []]), ...filesByMeeting]),
        complete: true,
        pagesRead: 1,
      };
      vi.mocked(fetchMeetings).mockResolvedValue(listing);
      vi.mocked(fetchMeetingFiles).mockResolvedValue(files);
    }

    function meetingId(townId: number, sourceMeetingId: string): unknown {
      return fake.meetings.get(`${townId}:${sourceMeetingId}`)?.meeting_id;
    }

    beforeEach(() => {
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
      vi.stubEnv('SUMMARY_API_KEY', '');
      vi.stubEnv('SUMMARY_MODEL', '');
      fake = createFakeSupabase();
      vi.mocked(getSupabaseClient).mockReturnValue(fake.client as unknown as ReturnType<typeof getSupabaseClient>);
      vi.mocked(fetchAgendaItems).mockImplementation((sourceAccountId, agendaRef) =>
        real.fetchAgendaItems(sourceAccountId, agendaRef),
      );
      vi.mocked(downloadFile).mockImplementation(async (file) => ({
        bytes: new TextEncoder().encode(`%PDF-1.4 file ${file.sourceFileId}`),
        mimeType: 'application/pdf',
      }));
    });

    it('stores 5 agenda items linked to a verified Town A meeting', async () => {
      stubAgendas({ '9001': FIXTURE });
      useListing([MEETING_100]);

      const response = await runRetrieval(TOWN_A.town_id);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ saved: 1, complete: true });
      expect(fetchAgendaItems).toHaveBeenCalledTimes(1);
      expect(fetchAgendaItems).toHaveBeenCalledWith('town-a', '9001');

      const id = meetingId(TOWN_A.town_id, '100');
      expect(id).toBeDefined();
      expect(fake.agendaItems).toHaveLength(5);
      expect(fake.agendaItems.every((row) => row.meeting_id === id)).toBe(true);
      expect(
        fake.agendaItems.map(({ source_item_id, sort_order, title, item_text }) => ({
          sourceItemId: source_item_id,
          sortOrder: sort_order,
          title,
          itemText: item_text,
        })),
      ).toEqual(EXPECTED_ITEMS);
    });

    it('makes no agenda-item request and stores none for a town whose flag is false', async () => {
      const fetchMock = stubAgendas({ '9001': FIXTURE });
      useListing([MEETING_100]);

      const response = await runRetrieval(TOWN_B.town_id);

      expect(response.status).toBe(200);
      expect(fake.meetings.size).toBe(1);
      expect(fetchAgendaItems).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(fake.tables).not.toContain('agenda_items');
      expect(fake.agendaItems).toEqual([]);
    });

    it('stores each agenda item once when the same meeting is retrieved twice, keeping baselined_at and removed_at', async () => {
      stubAgendas({ '9001': FIXTURE });
      useListing([MEETING_100]);

      await runRetrieval(TOWN_A.town_id);
      const baselinedAt = '2026-10-20T12:00:00.000000+00:00';
      for (const row of fake.agendaItems) {
        row.baselined_at = baselinedAt;
      }
      const firstIds = fake.agendaItems.map((row) => row.agenda_item_id);

      const response = await runRetrieval(TOWN_A.town_id);

      expect(response.status).toBe(200);
      expect(fake.agendaUpserts).toHaveLength(2);
      expect(fake.agendaUpserts.every((call) => call.onConflict === 'meeting_id,source_item_id')).toBe(true);
      expect(
        fake.agendaUpserts.flatMap((call) => call.rows).some((row) => 'baselined_at' in row || 'removed_at' in row),
      ).toBe(false);
      expect(fake.agendaItems).toHaveLength(5);
      expect(fake.agendaItems.map((row) => row.agenda_item_id)).toEqual(firstIds);
      expect(fake.agendaItems.every((row) => row.baselined_at === baselinedAt && row.removed_at === null)).toBe(true);
    });

    it('logs a failed agenda listing and still stores the other meetings and the documents', async () => {
      // Agenda 9001 answers 500; agenda 9002 answers the sample.
      stubAgendas({ '9002': FIXTURE });
      useListing([MEETING_100, MEETING_200], [['200', [FILE_300]]]);

      const response = await runRetrieval(TOWN_A.town_id);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ saved: 2, complete: true });
      expect(fetchAgendaItems).toHaveBeenCalledTimes(2);
      expect(fake.agendaItems).toHaveLength(5);
      expect(fake.agendaItems.every((row) => row.meeting_id === meetingId(TOWN_A.town_id, '200'))).toBe(true);
      expect(fake.agendaItems.some((row) => row.meeting_id === meetingId(TOWN_A.town_id, '100'))).toBe(false);
      expect(fake.documents.map((row) => row.source_file_id)).toEqual(['300']);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('meeting 100 failed at listing'));
    });
  });
});
