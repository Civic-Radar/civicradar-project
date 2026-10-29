import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SourceFile, SourceMeeting } from '../../lib/sources/types';

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

const SALEM_TOWN_ID = 1;
const OTHER_TOWN_ID = 2;

const TOWNS: Record<number, Row> = {
  [SALEM_TOWN_ID]: {
    town_id: SALEM_TOWN_ID,
    source_account_id: 'salemma',
    meeting_time_zone: 'America/New_York',
    provides_agenda_items: false,
  },
  [OTHER_TOWN_ID]: {
    town_id: OTHER_TOWN_ID,
    source_account_id: 'example-two',
    meeting_time_zone: 'America/New_York',
    provides_agenda_items: false,
  },
};

// Salem meeting 1192, which lists Agenda file 1166 and Agenda Packet file 1167.
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

const FILE_1166: SourceFile = {
  sourceFileId: '1166',
  fileName: 'Agenda',
  sourceFileType: 'Agenda',
  documentType: 'Agenda',
  downloadUrl: 'https://example.test/files/1166',
  sourcePageUrl: 'https://example.test/event/1192',
  sizeBytes: null,
};

const FILE_1167: SourceFile = {
  sourceFileId: '1167',
  fileName: 'Agenda Packet',
  sourceFileType: 'Agenda Packet',
  documentType: 'Packet',
  downloadUrl: 'https://example.test/files/1167',
  sourcePageUrl: 'https://example.test/event/1192',
  sizeBytes: null,
};

const FILE_BYTES: Record<string, Uint8Array> = {
  '1166': new TextEncoder().encode('%PDF-1.4 Salem agenda 1166'),
  '1167': new TextEncoder().encode('%PDF-1.4 Salem agenda packet 1167, a longer file'),
};

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

type Row = Record<string, unknown>;

interface Upload {
  bucket: string;
  path: string;
  body: Uint8Array;
  options: { contentType?: string; upsert?: boolean };
}

// Fake Supabase client. Storage rejects an existing path (upload with
// upsert: false) and documents rejects a repeated (town_id, source_file_id)
// or storage_path with 23505, the way the real ones do. beforeInsert runs
// just before each documents insert, so a test can play a concurrent run.
function createFakeSupabase() {
  const meetings = new Map<string, Row>();
  const documents: Row[] = [];
  const uploads: Upload[] = [];
  const attempts: Row[] = [];
  const storedPaths = new Set<string>();
  const hooks: { beforeInsert?: (row: Row) => void } = {};
  let nextMeetingId = 501;
  let nextDocumentId = 1;
  let nextAttemptId = 1;

  const client = {
    // The caller is a signed-in system administrator.
    auth: { getUser: async () => ({ data: { user: { id: 'admin-user' } }, error: null }) },
    from(table: string) {
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
              is: () => ({
                maybeSingle: async () => ({ data: TOWNS[townId] ?? null, error: null }),
              }),
            }),
          }),
        };
      }

      if (table === 'governing_bodies') {
        return {
          select: () => ({
            eq: () => ({
              is: async () => ({ data: [{ body_id: 1, name: 'City Council' }], error: null }),
            }),
          }),
        };
      }

      if (table === 'meetings') {
        return {
          upsert: (rows: Row[]) => {
            const saved = rows.map((row) => {
              const key = `${row.town_id}:${row.source_meeting_id}`;
              const meetingId = meetings.get(key)?.meeting_id ?? nextMeetingId++;
              const stored = { ...row, meeting_id: meetingId };
              meetings.set(key, stored);
              return stored;
            });
            return {
              select: async () => ({ data: saved.map((row) => ({ meeting_id: row.meeting_id })), error: null }),
            };
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
                hooks.beforeInsert?.(row);
                const duplicate = documents.some(
                  (existing) =>
                    (existing.town_id === row.town_id && existing.source_file_id === row.source_file_id) ||
                    existing.storage_path === row.storage_path,
                );
                if (duplicate) {
                  return {
                    data: null,
                    error: { code: '23505', message: 'duplicate key value violates unique constraint' },
                  };
                }
                const documentId = nextDocumentId++;
                documents.push({ ...row, document_id: documentId });
                return { data: { document_id: documentId }, error: null };
              },
            }),
          }),
          // The per-meeting lookup of already retrieved files (SRS-208.3).
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

      // Attempt 1 recorded after each documents insert (SRS-204.1). Only the
      // insert is faked: no summary job starts without the summary settings.
      if (table === 'summary_attempts') {
        return {
          insert: (row: Row) => ({
            select: () => ({
              single: async () => {
                const attempt = { attempt_id: nextAttemptId++, document_id: row.document_id, started_at: new Date().toISOString() };
                attempts.push(attempt);
                return { data: attempt, error: null };
              },
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
    storage: {
      from(bucket: string) {
        return {
          upload: async (path: string, body: Uint8Array, options: Upload['options']) => {
            const key = `${bucket}/${path}`;
            if (storedPaths.has(key) && !options.upsert) {
              return { data: null, error: { message: 'The resource already exists' } };
            }
            storedPaths.add(key);
            uploads.push({ bucket, path, body, options });
            return { data: { path }, error: null };
          },
        };
      },
    },
  };

  return { client, meetings, documents, uploads, attempts, hooks };
}

function runRetrieval(townId = SALEM_TOWN_ID) {
  return POST(
    new Request('http://localhost/api/retrieval/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer admin-token' },
      body: JSON.stringify({ townId }),
    }),
  );
}

function listFiles(files: SourceFile[]) {
  vi.mocked(fetchMeetingFiles).mockResolvedValueOnce({
    filesByMeeting: new Map([[MEETING_1192.sourceMeetingId, files]]),
    complete: true,
    pagesRead: 1,
  });
}

describe('New document retrieval (SRS-208.2)', () => {
  let fake: ReturnType<typeof createFakeSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
    // Blank summary settings, so no summary job starts even if the shell sets them.
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('SUMMARY_MODEL', '');

    // One fake per test, returned on every call, so both runs share it.
    fake = createFakeSupabase();
    vi.mocked(getSupabaseClient).mockReturnValue(fake.client as unknown as ReturnType<typeof getSupabaseClient>);

    vi.mocked(fetchMeetings).mockResolvedValue({ meetings: [MEETING_1192], complete: true, pagesRead: 1 });
    vi.mocked(downloadFile).mockImplementation(async (file: SourceFile) => ({
      bytes: FILE_BYTES[file.sourceFileId],
      mimeType: 'application/pdf',
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('stores one new file and inserts one documents row under its meeting', async () => {
    listFiles([FILE_1166]);

    const response = await runRetrieval();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: 1, complete: true });

    const meeting = fake.meetings.get(`${SALEM_TOWN_ID}:1192`);
    expect(meeting).toBeDefined();

    expect(fake.uploads).toHaveLength(1);
    expect(fake.uploads[0]).toMatchObject({
      bucket: 'documents',
      path: '1/1166.pdf',
      options: { contentType: 'application/pdf', upsert: false },
    });
    expect(fake.uploads[0].body).toEqual(FILE_BYTES['1166']);

    expect(fake.documents).toHaveLength(1);
    expect(fake.documents[0]).toMatchObject({
      meeting_id: meeting!.meeting_id,
      town_id: SALEM_TOWN_ID,
      source_file_id: '1166',
      title: 'Agenda',
      document_type: 'Agenda',
      storage_path: '1/1166.pdf',
      mime_type: 'application/pdf',
      file_size_bytes: FILE_BYTES['1166'].length,
      file_sha256: sha256(FILE_BYTES['1166']),
    });
    expect(fake.documents[0].file_sha256).toBe(sha256(fake.uploads[0].body));
  });

  it('adds only the extra file when a later listing has one more file', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    listFiles([FILE_1166]);
    expect((await runRetrieval()).status).toBe(200);
    expect(fake.documents).toHaveLength(1);

    listFiles([FILE_1166, FILE_1167]);
    const response = await runRetrieval();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: 1, complete: true });

    // The already retrieved file is skipped before the download and logged.
    expect(consoleLog).toHaveBeenCalledWith('Document retrieval: town 1 file 1166 already retrieved, skipped');
    expect(downloadFile).toHaveBeenCalledTimes(2);

    expect(fake.uploads.map((upload) => upload.path)).toEqual(['1/1166.pdf', '1/1167.pdf']);
    expect(fake.uploads[1].body).toEqual(FILE_BYTES['1167']);

    const meeting = fake.meetings.get(`${SALEM_TOWN_ID}:1192`);
    expect(fake.documents.map((row) => row.source_file_id)).toEqual(['1166', '1167']);
    expect(fake.documents[1]).toMatchObject({
      meeting_id: meeting!.meeting_id,
      town_id: SALEM_TOWN_ID,
      source_file_id: '1167',
      title: 'Agenda Packet',
      document_type: 'Packet',
      storage_path: '1/1167.pdf',
      file_size_bytes: FILE_BYTES['1167'].length,
      file_sha256: sha256(FILE_BYTES['1167']),
    });
  });

  // Shares the setup above: one fake per test, kept across both runs.
  describe('Duplicate entry prevention (SRS-208.3)', () => {
    it('keeps one row and one stored file per source file id when the same listing runs twice', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});

      listFiles([FILE_1166, FILE_1167]);
      expect((await runRetrieval()).status).toBe(200);

      listFiles([FILE_1166, FILE_1167]);
      const response = await runRetrieval();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ saved: 1, complete: true });

      expect(fake.documents.map((row) => row.source_file_id)).toEqual(['1166', '1167']);
      expect(fake.uploads.map((upload) => upload.path)).toEqual(['1/1166.pdf', '1/1167.pdf']);
      expect(downloadFile).toHaveBeenCalledTimes(2);
      expect(fake.attempts.map((attempt) => attempt.document_id)).toEqual([1, 2]);
    });

    it("leaves an existing row's retrieved_at and summary fields unchanged", async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const existing: Row = {
        document_id: 40,
        meeting_id: 501,
        town_id: SALEM_TOWN_ID,
        source_file_id: '1166',
        storage_path: '1/1166.pdf',
        retrieved_at: '2026-10-01T12:00:00.000000+00:00',
        summary_status: 'Complete',
        summary_text: 'An earlier summary.',
        summary_generated_at: '2026-10-01T12:05:00.000000+00:00',
      };
      fake.documents.push({ ...existing });
      listFiles([FILE_1166]);

      expect((await runRetrieval()).status).toBe(200);

      expect(fake.documents).toEqual([existing]);
      expect(downloadFile).not.toHaveBeenCalled();
      expect(fake.uploads).toEqual([]);
      expect(fake.attempts).toEqual([]);
    });

    it('treats a concurrent duplicate insert as already retrieved, with no error and no attempt', async () => {
      const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Another run inserts the row after this run's lookup found none.
      const concurrent: Row = {
        document_id: 99,
        town_id: SALEM_TOWN_ID,
        source_file_id: '1166',
        storage_path: '1/1166.bin',
      };
      fake.hooks.beforeInsert = () => {
        if (!fake.documents.some((row) => row.document_id === 99)) fake.documents.push({ ...concurrent });
      };
      listFiles([FILE_1166]);

      const response = await runRetrieval();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ saved: 1, complete: true });
      expect(fake.documents).toEqual([concurrent]);
      expect(fake.attempts).toEqual([]);

      expect(consoleLog).toHaveBeenCalledWith(expect.stringContaining('file 1166 already retrieved at insert'));
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('1/1166.pdf stored but no documents row'));
      expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining('failed at'));
    });

    it('creates a separate row for the same source file id in a different town', async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});

      listFiles([FILE_1166]);
      expect((await runRetrieval(SALEM_TOWN_ID)).status).toBe(200);

      listFiles([FILE_1166]);
      expect((await runRetrieval(OTHER_TOWN_ID)).status).toBe(200);

      expect(fake.documents.map((row) => [row.town_id, row.source_file_id, row.storage_path])).toEqual([
        [SALEM_TOWN_ID, '1166', '1/1166.pdf'],
        [OTHER_TOWN_ID, '1166', '2/1166.pdf'],
      ]);
      expect(fake.uploads.map((upload) => upload.path)).toEqual(['1/1166.pdf', '2/1166.pdf']);
      expect(fake.documents[0].meeting_id).not.toBe(fake.documents[1].meeting_id);
      expect(fake.attempts.map((attempt) => attempt.document_id)).toEqual([1, 2]);
    });
  });
});
