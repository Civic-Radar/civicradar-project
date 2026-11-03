import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileTooLargeError, type SourceFile, type SourceMeeting } from '../../lib/sources/types';

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

// The real client is loaded with importActual, with fetch stubbed, so nothing
// goes live.
vi.mock('../../lib/sources/civicclerk', () => ({
  fetchMeetings: vi.fn(),
  fetchMeetingFiles: vi.fn(),
  fetchAgendaItems: vi.fn(),
  downloadFile: vi.fn(),
}));

import { DEFAULT_MAX_FILE_MB, retrievalMaxFileBytes } from '../../lib/retrieval/maxFileSize';
import { runTownRetrieval, type RetrievalSource } from '../../lib/retrieval/runTownRetrieval';

type CivicClerkClient = typeof import('../../lib/sources/civicclerk');
type Row = Record<string, unknown>;
type FakeClient = Parameters<typeof runTownRetrieval>[0];

const MB = 1024 * 1024;

const TOWN = {
  town_id: 1,
  source_account_id: 'town-a',
  meeting_time_zone: 'America/New_York',
  provides_agenda_items: false,
};

const NOW = new Date('2026-11-03T15:30:00.000Z');

const SOURCE_MEETING_ID = '7001';

function fileUrl(id: string): string {
  return `https://town-a.api.civicclerk.com/v1/Meetings/GetMeetingFileStream(fileId=${id},plainText=false)`;
}

function file(id: string): SourceFile {
  return {
    sourceFileId: id,
    fileName: `File ${id}`,
    sourceFileType: 'Agenda Packet',
    documentType: 'Packet',
    downloadUrl: fileUrl(id),
    sourcePageUrl: `https://town-a.portal.civicclerk.com/event/${SOURCE_MEETING_ID}/overview`,
    sizeBytes: null,
  };
}

function meeting(): SourceMeeting {
  return {
    sourceMeetingId: SOURCE_MEETING_ID,
    title: 'Board meeting',
    sourceBodyId: '1',
    sourceBodyName: 'Board',
    sourceStartTime: '2026-11-01T19:00:00Z',
    location: null,
    onlineLink: null,
    sourceUrl: `https://town-a.portal.civicclerk.com/event/${SOURCE_MEETING_ID}/overview`,
    agendaRef: null,
  };
}

// A body that hands out the given chunks one read at a time. With a high
// water mark of 0 nothing is read before the client asks, so pulls counts
// exactly the reads the client made, and cancelled records a cancel.
function trackedBody(chunks: Uint8Array[], onPull?: () => void) {
  const state = { pulls: 0, cancelled: false };
  let index = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        state.pulls += 1;
        onPull?.();
        if (index < chunks.length) {
          controller.enqueue(chunks[index]);
          index += 1;
        } else {
          controller.close();
        }
      },
      cancel() {
        state.cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, state };
}

function bytesOf(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function pdfResponse(stream: ReadableStream<Uint8Array>, contentLength?: number): Response {
  const headers: Record<string, string> = { 'content-type': 'application/pdf' };
  if (contentLength !== undefined) {
    headers['content-length'] = String(contentLength);
  }
  return new Response(stream, { status: 200, headers });
}

// Serves each file URL with its own response and fails on any other URL.
function stubFiles(responses: Record<string, () => Response>) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const respond = responses[String(input)];
    if (!respond) {
      throw new Error(`Unexpected URL: ${String(input)}`);
    }
    return respond();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestedUrls(fetchMock: ReturnType<typeof stubFiles>): string[] {
  return fetchMock.mock.calls.map(([input]) => String(input));
}

// Fake Supabase client for a direct run: one check row, no governing bodies,
// meetings keyed like the table's unique key, the given documents already
// stored, and every upload, insert and check update recorded.
function createFakeSupabase(existingFileIds: string[] = []) {
  const meetings = new Map<string, Row>();
  const uploads: string[] = [];
  const inserts: Row[] = [];
  const checkUpdates: Row[] = [];
  const rpcCalls: string[] = [];
  let nextMeetingId = 501;
  let nextDocumentId = 901;

  const client = {
    from(table: string) {
      if (table === 'source_checks') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { check_id: 1, started_at: '2026-11-03T15:29:00.000000+00:00' }, error: null }),
            }),
          }),
          update: (values: Row) => {
            checkUpdates.push(values);
            return { eq: async () => ({ data: null, error: null }) };
          },
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
          select: () => ({
            eq: () => ({
              in: async (_column: string, sourceFileIds: string[]) => ({
                data: existingFileIds
                  .filter((id) => sourceFileIds.includes(id))
                  .map((id) => ({ source_file_id: id })),
                error: null,
              }),
            }),
          }),
          insert: (row: Row) => {
            inserts.push(row);
            return {
              select: () => ({ single: async () => ({ data: { document_id: nextDocumentId++ }, error: null }) }),
            };
          },
        };
      }

      if (table === 'summary_attempts') {
        return {
          insert: (row: Row) => ({
            select: () => ({
              single: async () => ({
                data: { attempt_id: 1, document_id: row.document_id, started_at: NOW.toISOString(), claimed_at: null },
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
        upload: async (path: string) => {
          uploads.push(path);
          return { data: { path }, error: null };
        },
      }),
    },
    rpc: async (name: string) => {
      rpcCalls.push(name);
      return { data: null, error: null };
    },
  };

  return { client, uploads, inserts, checkUpdates, rpcCalls };
}

describe('Download size limit (SRS-208.2)', () => {
  let real: CivicClerkClient;

  beforeAll(async () => {
    real = await vi.importActual<CivicClerkClient>('../../lib/sources/civicclerk');
  });

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('source client download', () => {
    it('cancels the body without reading it when the declared size is over the limit', async () => {
      const body = trackedBody([new Uint8Array(2000)]);
      stubFiles({ [fileUrl('1')]: () => pdfResponse(body.stream, 2000) });

      const error = await real.downloadFile(file('1'), { maxBytes: 1000 }).catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(FileTooLargeError);
      expect(error).toMatchObject({ sizeBytes: 2000, maxBytes: 1000 });
      expect(body.state.pulls).toBe(0);
      expect(body.state.cancelled).toBe(true);
    });

    it('stops reading and cancels as soon as a body with no Content-Length passes the limit', async () => {
      const chunks = Array.from({ length: 10 }, () => new Uint8Array(400));
      const body = trackedBody(chunks);
      stubFiles({ [fileUrl('1')]: () => pdfResponse(body.stream) });

      const error = await real.downloadFile(file('1'), { maxBytes: 1000 }).catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(FileTooLargeError);
      expect(error).toMatchObject({ sizeBytes: null, maxBytes: 1000 });
      // 400, 800, then 1200 passes the limit: 3 of the 10 chunks are read.
      expect(body.state.pulls).toBe(3);
      expect(body.state.cancelled).toBe(true);
    });

    it('returns the bytes of a file within the limit', async () => {
      const body = trackedBody([bytesOf(1, 2, 3, 4, 5)]);
      stubFiles({ [fileUrl('1')]: () => pdfResponse(body.stream, 5) });

      const result = await real.downloadFile(file('1'), { maxBytes: 1000 });

      expect(result).toEqual({ bytes: bytesOf(1, 2, 3, 4, 5), mimeType: 'application/pdf' });
      expect(body.state.cancelled).toBe(false);
    });

    it('returns a file whose declared size is exactly the limit', async () => {
      stubFiles({ [fileUrl('1')]: () => pdfResponse(trackedBody([bytesOf(1, 2, 3, 4, 5)]).stream, 5) });

      const result = await real.downloadFile(file('1'), { maxBytes: 5 });

      expect(result.bytes).toEqual(bytesOf(1, 2, 3, 4, 5));
    });

    it('joins the chunks of a body with no Content-Length read within the limit', async () => {
      stubFiles({ [fileUrl('1')]: () => pdfResponse(trackedBody([bytesOf(1, 2, 3), bytesOf(4, 5)]).stream) });

      const result = await real.downloadFile(file('1'), { maxBytes: 1000 });

      expect(result).toEqual({ bytes: bytesOf(1, 2, 3, 4, 5), mimeType: 'application/pdf' });
    });

    it('still rejects a truncated download within the limit', async () => {
      stubFiles({ [fileUrl('1')]: () => pdfResponse(trackedBody([bytesOf(1, 2, 3, 4, 5)]).stream, 10) });

      await expect(real.downloadFile(file('1'), { maxBytes: 1000 })).rejects.toThrow(
        'CivicClerk file 1 is 5 bytes but Content-Length is 10',
      );
    });

    it('has no size limit when the caller passes none', async () => {
      stubFiles({ [fileUrl('1')]: () => pdfResponse(trackedBody([new Uint8Array(2000)]).stream, 2000) });

      const result = await real.downloadFile(file('1'));

      expect(result.bytes).toHaveLength(2000);
    });
  });

  describe('download time limit', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });

    // Settles to the error message, so a pending download can be checked
    // without an unhandled rejection.
    function outcomeOf(download: Promise<unknown>) {
      const outcome = { settled: false, message: '' };
      const done = download.then(
        () => {
          outcome.settled = true;
        },
        (error: Error) => {
          outcome.settled = true;
          outcome.message = error.message;
        },
      );
      return { outcome, done };
    }

    it('stops a download whose headers never arrive after 120 seconds', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_input: string | URL | Request, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
            }),
        ),
      );

      const { outcome, done } = outcomeOf(real.downloadFile(file('1'), { maxBytes: 1000 }));

      await vi.advanceTimersByTimeAsync(119_999);
      expect(outcome.settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await done;
      expect(outcome.message).toBe('CivicClerk could not be reached for file 1: download took longer than 120 s');
    });

    it('stops a download whose body stalls after 120 seconds', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
          const stream = new ReadableStream<Uint8Array>(
            {
              start(controller) {
                controller.enqueue(bytesOf(1, 2, 3));
                init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason));
              },
            },
            { highWaterMark: 0 },
          );
          return pdfResponse(stream);
        }),
      );

      const { outcome, done } = outcomeOf(real.downloadFile(file('1'), { maxBytes: 1000 }));

      await vi.advanceTimersByTimeAsync(119_999);
      expect(outcome.settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await done;
      expect(outcome.message).toBe('CivicClerk file 1 download did not finish: download took longer than 120 s');
    });

    it('stops a stalled body with a declared size within the limit after 120 seconds', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
          const stream = new ReadableStream<Uint8Array>(
            {
              start(controller) {
                init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason));
              },
            },
            { highWaterMark: 0 },
          );
          return pdfResponse(stream, 500);
        }),
      );

      const { outcome, done } = outcomeOf(real.downloadFile(file('1'), { maxBytes: 1000 }));

      await vi.advanceTimersByTimeAsync(120_000);
      await done;
      expect(outcome.message).toMatch(/^CivicClerk file 1 download did not finish: /);
    });
  });

  describe('retrieval run', () => {
    beforeEach(() => {
      vi.stubEnv('RETRIEVAL_MAX_FILE_MB', '');
      // No summary job starts.
      vi.stubEnv('SUMMARY_API_KEY', '');
    });

    // Lists one meeting with the given files, and downloads with the real client.
    function createSource(files: SourceFile[]) {
      return {
        fetchMeetings: vi.fn(async () => ({ meetings: [meeting()], complete: true, pagesRead: 1 })),
        fetchMeetingFiles: vi.fn(async () => ({
          filesByMeeting: new Map([[SOURCE_MEETING_ID, files]]),
          complete: true,
          pagesRead: 1,
        })),
        fetchAgendaItems: vi.fn(async () => []),
        downloadFile: vi.fn(real.downloadFile),
      };
    }

    function run(fake: ReturnType<typeof createFakeSupabase>, source: ReturnType<typeof createSource>) {
      return runTownRetrieval(fake.client as unknown as FakeClient, TOWN, source as unknown as RetrievalSource, {
        maxPages: 20,
        now: () => NOW,
      });
    }

    function logLines(): string[] {
      return vi.mocked(console.log).mock.calls.map((call) => String(call[0]));
    }

    it('skips an oversized document without failing, stores the rest, and the check still completes', async () => {
      const oversized = trackedBody([new Uint8Array(10)]);
      const fetchMock = stubFiles({
        [fileUrl('101')]: () => pdfResponse(trackedBody([bytesOf(1, 2, 3, 4, 5)]).stream, 5),
        [fileUrl('102')]: () => pdfResponse(oversized.stream, 51 * MB),
      });
      const fake = createFakeSupabase(['100']);
      const source = createSource([file('100'), file('101'), file('102')]);

      const result = await run(fake, source);

      expect(result).toEqual({ ok: true, saved: 1, complete: true });
      // The stored file 100 is still skipped before any download.
      expect(requestedUrls(fetchMock)).toEqual([fileUrl('101'), fileUrl('102')]);
      expect(source.downloadFile).toHaveBeenCalledWith(
        expect.objectContaining({ sourceFileId: '102' }),
        expect.objectContaining({ maxBytes: 50 * MB }),
      );
      // The oversized body is never read, and nothing of it is stored.
      expect(oversized.state.pulls).toBe(0);
      expect(oversized.state.cancelled).toBe(true);
      expect(fake.uploads).toEqual(['1/101.pdf']);
      expect(fake.inserts.map((row) => row.source_file_id)).toEqual(['101']);
      expect(logLines()).toContain('Document retrieval: town 1 file 102 skipped, 51 MB is over the 50 MB limit');
      expect(logLines()).toContain('Document retrieval: town 1 stored 1, already retrieved 1, failed 0, skipped 1');
      expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining('failed at'));
      // The check is closed, and the oversized file does not make it unsuccessful.
      expect(fake.checkUpdates).toEqual([expect.objectContaining({ changes_found: true })]);
      expect(fake.rpcCalls).toEqual(['process_successful_check']);
    });

    it('skips a document with no declared size once it passes a limit lowered by RETRIEVAL_MAX_FILE_MB', async () => {
      vi.stubEnv('RETRIEVAL_MAX_FILE_MB', '1');
      const body = trackedBody([new Uint8Array(600 * 1024), new Uint8Array(600 * 1024), new Uint8Array(600 * 1024)]);
      stubFiles({ [fileUrl('104')]: () => pdfResponse(body.stream) });
      const fake = createFakeSupabase();
      const source = createSource([file('104')]);

      const result = await run(fake, source);

      expect(result).toEqual({ ok: true, saved: 1, complete: true });
      expect(source.downloadFile).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ maxBytes: MB }));
      expect(body.state.pulls).toBe(2);
      expect(body.state.cancelled).toBe(true);
      expect(fake.uploads).toEqual([]);
      expect(fake.inserts).toEqual([]);
      expect(logLines()).toContain('Document retrieval: town 1 file 104 skipped, more than the 1 MB limit');
      expect(logLines()).toContain('Document retrieval: town 1 stored 0, already retrieved 0, failed 0, skipped 1');
      expect(fake.rpcCalls).toEqual(['process_successful_check']);
    });

    it('logs a download declared over 20 MB before its body is read, and stores it', async () => {
      let linesAtFirstRead: string[] | null = null;
      const large = trackedBody([new Uint8Array(25 * MB)], () => {
        linesAtFirstRead ??= logLines();
      });
      stubFiles({
        [fileUrl('103')]: () => pdfResponse(large.stream, 25 * MB),
        [fileUrl('105')]: () => pdfResponse(trackedBody([bytesOf(1, 2, 3)]).stream, 3),
      });
      const fake = createFakeSupabase();

      const result = await run(fake, createSource([file('103'), file('105')]));

      expect(result).toEqual({ ok: true, saved: 1, complete: true });
      expect(linesAtFirstRead).toContain('Document retrieval: town 1 file 103 downloading 25 MB');
      expect(fake.uploads).toEqual(['1/103.pdf', '1/105.pdf']);
      // A small file gets no downloading line.
      expect(logLines().filter((line) => line.includes('downloading'))).toEqual([
        'Document retrieval: town 1 file 103 downloading 25 MB',
      ]);
    });
  });

  describe('document size limit setting', () => {
    function sizeEnv(setting: string | undefined) {
      return { ...process.env, RETRIEVAL_MAX_FILE_MB: setting };
    }

    it('defaults to 50 MB', () => {
      expect(DEFAULT_MAX_FILE_MB).toBe(50);
      expect(retrievalMaxFileBytes(sizeEnv(undefined))).toBe(50 * MB);
    });

    it.each([
      ['1', 1],
      ['10', 10],
      ['50', 50],
    ] as const)('lowers the limit to RETRIEVAL_MAX_FILE_MB %j', (setting, megabytes) => {
      expect(retrievalMaxFileBytes(sizeEnv(setting))).toBe(megabytes * MB);
    });

    it.each(['', 'abc', '0', '-3', '2.5', '51'])('uses 50 MB for RETRIEVAL_MAX_FILE_MB %j', (setting) => {
      expect(retrievalMaxFileBytes(sizeEnv(setting))).toBe(50 * MB);
    });
  });
});
