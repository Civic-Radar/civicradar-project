import { createHash } from 'node:crypto';
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

const SALEM_TOWN_ID = 1;

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
// or storage_path with 23505, the way the real ones do.
function createFakeSupabase() {
  const meetings = new Map<string, Row>();
  const documents: Row[] = [];
  const uploads: Upload[] = [];
  const storedPaths = new Set<string>();
  let nextMeetingId = 501;
  let nextDocumentId = 1;
  let nextAttemptId = 1;

  const client = {
    from(table: string) {
      if (table === 'towns') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({
                  data: { town_id: SALEM_TOWN_ID, source_account_id: 'salemma', meeting_time_zone: 'America/New_York' },
                  error: null,
                }),
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

  return { client, meetings, documents, uploads };
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

function listFiles(files: SourceFile[]) {
  vi.mocked(fetchMeetingFiles).mockResolvedValueOnce(new Map([[MEETING_1192.sourceMeetingId, files]]));
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

    vi.mocked(fetchMeetings).mockResolvedValue([MEETING_1192]);
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
    expect(await response.json()).toEqual({ saved: 1 });

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
    expect(await response.json()).toEqual({ saved: 1 });

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
});
