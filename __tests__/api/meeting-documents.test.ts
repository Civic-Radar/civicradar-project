import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SourceFile, SourceMeeting } from '../../lib/sources/types';

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('../../lib/sources/civicclerk', () => ({
  fetchMeetings: vi.fn(),
  fetchMeetingFiles: vi.fn(),
  downloadFile: vi.fn(),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { downloadFile, fetchMeetingFiles, fetchMeetings } from '../../lib/sources/civicclerk';
import { POST } from '../../app/api/retrieval/meetings/route';
import { GET } from '../../app/api/meetings/[id]/route';

const SALEM_TOWN_ID = 1;

// Internal meeting_ids differ from the source ids, so a test cannot pass by
// confusing the two.
const MEETING_IDS: Record<string, number> = { '1192': 9, '1165': 4 };

const MEETING_1192_PAGE = 'https://example.test/event/1192/overview';

// Salem meeting 1192, which lists Agenda file 1166 and Agenda Packet file 1167.
const MEETING_1192: SourceMeeting = {
  sourceMeetingId: '1192',
  title: 'City Council',
  sourceBodyId: '1',
  sourceBodyName: 'City Council',
  sourceStartTime: '2026-10-08T19:00:00Z',
  location: 'City Hall',
  onlineLink: null,
  sourceUrl: MEETING_1192_PAGE,
};

// A meeting the source lists with no files.
const MEETING_1165: SourceMeeting = {
  sourceMeetingId: '1165',
  title: 'Planning Board',
  sourceBodyId: '2',
  sourceBodyName: 'Planning Board',
  sourceStartTime: '2026-10-01T18:30:00Z',
  location: 'City Hall',
  onlineLink: null,
  sourceUrl: 'https://example.test/event/1165/overview',
};

const FILE_1166: SourceFile = {
  sourceFileId: '1166',
  fileName: 'Agenda',
  sourceFileType: 'Agenda',
  documentType: 'Agenda',
  downloadUrl: 'https://example.test/files/1166',
  sourcePageUrl: MEETING_1192_PAGE,
  sizeBytes: null,
};

const FILE_1167: SourceFile = {
  sourceFileId: '1167',
  fileName: 'Agenda Packet',
  sourceFileType: 'Agenda Packet',
  documentType: 'Packet',
  downloadUrl: 'https://example.test/files/1167',
  sourcePageUrl: MEETING_1192_PAGE,
  sizeBytes: null,
};

type Row = Record<string, unknown>;

// Read query over a copy of the rows. eq, is and in filter; select's column
// list picks the returned fields. Only order('document_id', { ascending: true })
// sorts; anything else leaves the rows in stored order.
function query(rows: Row[], columns: string) {
  const fields = columns.split(',').map((column) => column.trim());
  let result = [...rows];
  const project = (row: Row) => Object.fromEntries(fields.map((field) => [field, row[field]]));

  const builder = {
    eq(column: string, value: unknown) {
      result = result.filter((row) => row[column] === value);
      return builder;
    },
    is(column: string, value: unknown) {
      result = result.filter((row) => row[column] === value);
      return builder;
    },
    in(column: string, values: unknown[]) {
      result = result.filter((row) => values.includes(row[column]));
      return builder;
    },
    order(column: string, options?: { ascending?: boolean }) {
      if (column === 'document_id' && options?.ascending === true) {
        result.sort((a, b) => (a.document_id as number) - (b.document_id as number));
      }
      return builder;
    },
    maybeSingle: async () => ({ data: result.length > 0 ? project(result[0]) : null, error: null }),
    then<T>(resolve: (value: { data: Row[]; error: null }) => T, reject?: (reason: unknown) => T) {
      return Promise.resolve({ data: result.map(project), error: null }).then(resolve, reject);
    },
  };
  return builder;
}

// Fake Supabase client shared by the retrieval run and the meeting details
// read. documents keeps the newest row first, so rows come back in the wrong
// order unless the route sorts them.
function createFakeSupabase() {
  const towns: Row[] = [
    {
      town_id: SALEM_TOWN_ID,
      name: 'Salem',
      source_account_id: 'example',
      meeting_time_zone: 'America/New_York',
      removed_at: null,
    },
  ];
  const governingBodies: Row[] = [
    { body_id: 7, town_id: SALEM_TOWN_ID, name: 'City Council', removed_at: null },
    { body_id: 8, town_id: SALEM_TOWN_ID, name: 'Planning Board', removed_at: null },
  ];
  const meetings: Row[] = [];
  const documents: Row[] = [];
  let nextDocumentId = 31;
  let nextAttemptId = 1;

  const client = {
    from(table: string) {
      if (table === 'towns') {
        return { select: (columns: string) => query(towns, columns) };
      }

      if (table === 'governing_bodies') {
        return { select: (columns: string) => query(governingBodies, columns) };
      }

      if (table === 'meetings') {
        return {
          upsert: (rows: Row[]) => {
            const saved = rows.map((row) => {
              const stored = { ...row, meeting_id: MEETING_IDS[row.source_meeting_id as string] };
              const index = meetings.findIndex((existing) => existing.meeting_id === stored.meeting_id);
              if (index === -1) {
                meetings.push(stored);
              } else {
                meetings[index] = stored;
              }
              return stored;
            });
            return { select: (columns: string) => query(saved, columns) };
          },
          select: (columns: string) => query(meetings, columns),
        };
      }

      if (table === 'documents') {
        return {
          insert: (row: Row) => ({
            select: () => ({
              single: async () => {
                const documentId = nextDocumentId++;
                documents.unshift({ ...row, document_id: documentId });
                return { data: { document_id: documentId }, error: null };
              },
            }),
          }),
          select: (columns: string) => query(documents, columns),
        };
      }

      // Attempt 1 recorded after each documents insert (SRS-204.1). Only the
      // insert is faked: no summary job starts without the summary settings.
      if (table === 'summary_attempts') {
        return {
          insert: (row: Row) => ({
            select: () => ({
              single: async () => ({
                data: { attempt_id: nextAttemptId++, document_id: row.document_id, started_at: new Date().toISOString() },
                error: null,
              }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    storage: {
      from: () => ({
        upload: async (path: string) => ({ data: { path }, error: null }),
      }),
    },
  };

  return { client, meetings, documents };
}

function runRetrieval() {
  return POST(
    new Request('http://localhost/api/retrieval/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ townId: SALEM_TOWN_ID }),
    }),
  );
}

function getMeeting(id: number) {
  return GET(new Request(`http://localhost/api/meetings/${id}`), { params: { id: String(id) } });
}

describe('Meeting document link (SRS-220.7)', () => {
  let fake: ReturnType<typeof createFakeSupabase>;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
    // Blank summary settings, so no summary job starts even if the shell sets them.
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('SUMMARY_MODEL', '');

    fake = createFakeSupabase();
    vi.mocked(getSupabaseClient).mockReturnValue(fake.client as unknown as ReturnType<typeof getSupabaseClient>);

    vi.mocked(fetchMeetings).mockResolvedValue({ meetings: [MEETING_1192, MEETING_1165], complete: true, pagesRead: 1 });
    vi.mocked(fetchMeetingFiles).mockResolvedValue({
      filesByMeeting: new Map([
        [MEETING_1192.sourceMeetingId, [FILE_1166, FILE_1167]],
        [MEETING_1165.sourceMeetingId, []],
      ]),
      complete: true,
      pagesRead: 1,
    });
    vi.mocked(downloadFile).mockImplementation(async (file: SourceFile) => ({
      bytes: new TextEncoder().encode(`%PDF-1.4 file ${file.sourceFileId}`),
      mimeType: 'application/pdf',
    }));

    const response = await runRetrieval();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: 2 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("links both files to meeting 1192's row", async () => {
    expect(fake.meetings.map((row) => [row.source_meeting_id, row.meeting_id])).toEqual([
      ['1192', 9],
      ['1165', 4],
    ]);

    expect(fake.documents).toHaveLength(2);
    for (const sourceFileId of ['1166', '1167']) {
      expect(fake.documents.find((row) => row.source_file_id === sourceFileId)).toMatchObject({
        meeting_id: 9,
        town_id: SALEM_TOWN_ID,
      });
    }
  });

  it('returns both documents for meeting 1192, sorted by document_id', async () => {
    // Stored newest first, so an unsorted read would return 32 before 31.
    expect(fake.documents.map((row) => row.document_id)).toEqual([32, 31]);

    const response = await getMeeting(9);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meeting).toMatchObject({ meeting_id: 9, town_id: SALEM_TOWN_ID, source_url: MEETING_1192_PAGE });
    expect(body.documents).toEqual([
      { document_id: 31, title: 'Agenda', document_type: 'Agenda', source_url: MEETING_1192_PAGE },
      { document_id: 32, title: 'Agenda Packet', document_type: 'Packet', source_url: MEETING_1192_PAGE },
    ]);
  });

  it('returns an empty documents array for meeting 1165, which lists no files', async () => {
    // The same documents table holds meeting 1192's two rows.
    expect(fake.documents).toHaveLength(2);

    const response = await getMeeting(4);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meeting).toMatchObject({ meeting_id: 4, town_id: SALEM_TOWN_ID });
    expect(body.documents).toEqual([]);
  });
});
