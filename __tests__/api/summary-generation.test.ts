import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SourceFile, SourceMeeting } from '../../lib/sources/types';
import type { SummaryResult } from '../../lib/summaries/summarize';

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('../../lib/sources/civicclerk', () => ({
  fetchMeetings: vi.fn(),
  fetchMeetingFiles: vi.fn(),
  fetchAgendaItems: vi.fn(),
  downloadFile: vi.fn(),
}));

// Every test that runs a job uses this mock, so no test depends on the real
// keys being unset and the Anthropic SDK is never loaded.
vi.mock('../../lib/summaries/summarize', () => ({
  summarizeDocument: vi.fn(),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { downloadFile, fetchMeetingFiles, fetchMeetings } from '../../lib/sources/civicclerk';
import { summarizeDocument } from '../../lib/summaries/summarize';
import { POST } from '../../app/api/retrieval/meetings/route';

const SALEM_TOWN_ID = 1;
const MEETING_1192_ID = 9;
const MEETING_1192_PAGE = 'https://example.test/event/1192/overview';

// Distinctive values, so the console checks can prove none of them is logged.
const ANTHROPIC_KEY = 'test-anthropic-key-MARKER-91d2';
const MODEL_NAME = 'test-model-MARKER-55af';
const SERVICE_ROLE_KEY = 'test-service-role-key-MARKER-3b8e';
const PDF_MARKER = 'PDF-BYTES-MARKER-7c1e';

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

function makeFile(sourceFileId: string, fileName: string, documentType: SourceFile['documentType']): SourceFile {
  return {
    sourceFileId,
    fileName,
    sourceFileType: fileName,
    documentType,
    downloadUrl: `https://example.test/files/${sourceFileId}`,
    sourcePageUrl: MEETING_1192_PAGE,
    sizeBytes: null,
  };
}

const FILE_1166 = makeFile('1166', 'Agenda', 'Agenda');
const FILE_1167 = makeFile('1167', 'Agenda Packet', 'Packet');

function fileBytes(sourceFileId: string): Uint8Array {
  return new TextEncoder().encode(`%PDF-1.4 ${PDF_MARKER} file ${sourceFileId}`);
}

function words(marker: string, count: number): string {
  return [marker, ...Array.from({ length: count - 1 }, (_, i) => `council${i}`)].join(' ');
}

const SUMMARY_120 = words('SUMMARY-120-MARKER', 120);
const SUMMARY_151 = words('SUMMARY-151-MARKER', 151);

type Row = Record<string, unknown>;

interface PostgrestError {
  code: string;
  message: string;
  details: string | null;
}

// Timestamps in the format PostgREST returns (microseconds, +00:00).
function pgTimestamp(ms: number): string {
  return new Date(ms).toISOString().replace('Z', '000+00:00');
}

// Compares timestamps by time, not by text: 'Z' and '+00:00' do not sort as strings.
function toMs(timestamp: unknown): number {
  return Date.parse(String(timestamp).replace(/(\.\d{3})\d+/, '$1'));
}

// Postgres word count from the documents check and finish_summary_attempt:
// btrim removes spaces only, then split on \s+.
function pgWordCount(text: string): number {
  return text.replace(/^ +| +$/g, '').split(/\s+/).length;
}

// Read query over a copy of the rows. eq, is and in filter; select's column
// list picks the returned fields.
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
    maybeSingle: async () => ({ data: result.length > 0 ? project(result[0]) : null, error: null }),
    then<T>(resolve: (value: { data: Row[]; error: null }) => T, reject?: (reason: unknown) => T) {
      return Promise.resolve({ data: result.map(project), error: null }).then(resolve, reject);
    },
  };
  return builder;
}

// Fake Supabase client for the retrieval run and the summary job. documents
// and summary_attempts apply the table defaults, unique keys and checks from
// supabase/schema.sql. rpc('finish_summary_attempt') follows the SQL function
// statement by statement and rolls back any write that breaks a table check.
// Anything not faked throws, so an unexpected call fails the test.
function createFakeSupabase() {
  const towns: Row[] = [
    {
      town_id: SALEM_TOWN_ID,
      name: 'Salem',
      source_account_id: 'example',
      meeting_time_zone: 'America/New_York',
      provides_agenda_items: false,
      removed_at: null,
    },
  ];
  const governingBodies: Row[] = [{ body_id: 7, town_id: SALEM_TOWN_ID, name: 'City Council', removed_at: null }];
  const meetings: Row[] = [];
  const documents: Row[] = [];
  const attempts: Row[] = [];
  const objects = new Map<string, Uint8Array>();
  // Paths Storage answers with 404 even when uploaded.
  const hiddenObjects = new Set<string>();
  // Every operation in order, so tests can check call order.
  const events: string[] = [];
  // Every summary_attempts insert, including rejected ones.
  const attemptInsertCalls: Row[] = [];
  const rpcCalls: { name: string; args: Row }[] = [];
  let nextDocumentId = 31;
  let nextAttemptId = 1;

  const dbNow = () => pgTimestamp(Date.now());
  const pgError = (code: string, message: string, details: string | null = null) => ({
    data: null,
    error: { code, message, details } as PostgrestError,
  });

  // The CHECK constraints on documents and summary_attempts. Returns the
  // first one a row breaks, or null.
  function brokenCheck(): string | null {
    for (const doc of documents) {
      if ((doc.summary_status === 'Complete') !== (doc.summary_text !== null)) return 'documents: Complete needs text';
      if ((doc.summary_text === null) !== (doc.summary_generated_at === null)) return 'documents: text and time';
      if (doc.summary_generated_at !== null && toMs(doc.summary_generated_at) < toMs(doc.retrieved_at)) {
        return 'documents: generated before retrieved';
      }
      if (typeof doc.summary_text === 'string' && pgWordCount(doc.summary_text) > 150) return 'documents: over 150 words';
    }
    for (const attempt of attempts) {
      if (!['In progress', 'Succeeded', 'Failed'].includes(attempt.outcome as string)) return 'attempts: outcome';
      if ((attempt.outcome === 'In progress') !== (attempt.ended_at === null)) return 'attempts: ended_at';
      if (attempt.ended_at !== null && toMs(attempt.ended_at) < toMs(attempt.started_at)) {
        return 'attempts: ended before started';
      }
      if ((attempt.attempt_number as number) < 1) return 'attempts: attempt_number';
    }
    return null;
  }

  function finishSummaryAttempt(args: Row) {
    const keys = Object.keys(args).sort().join(',');
    if (keys !== 'p_attempt_id,p_outcome,p_summary_text') {
      return pgError('PGRST202', 'Could not find the function public.finish_summary_attempt');
    }
    const { p_attempt_id: attemptId, p_outcome: outcome, p_summary_text: text } = args;
    // Worst case: the error details carry the summary text.
    const raise = (message: string) =>
      pgError('22023', `finish_summary_attempt: ${message}`, typeof text === 'string' ? text : null);

    if (outcome === 'Succeeded') {
      if (typeof text !== 'string' || !/\S/.test(text)) return raise('summary text is empty');
      if (pgWordCount(text) > 150) return raise('summary text is over 150 words');
    } else if (outcome === 'Failed') {
      if (text !== null) return raise('a failed attempt takes no summary text');
    } else {
      return raise('outcome must be Succeeded or Failed');
    }

    const attempt = attempts.find((row) => row.attempt_id === attemptId);
    if (!attempt) return { data: 'attempt_not_found', error: null };
    if (attempt.outcome !== 'In progress') return { data: 'attempt_not_in_progress', error: null };

    const doc = documents.find((row) => row.document_id === attempt.document_id);
    if (!doc || doc.summary_status !== 'Pending') return { data: 'document_not_pending', error: null };

    const savedAttempt = { ...attempt };
    const savedDoc = { ...doc };
    const now = dbNow();
    attempt.outcome = outcome;
    attempt.ended_at = toMs(now) >= toMs(attempt.started_at) ? now : attempt.started_at;
    if (outcome === 'Succeeded') {
      doc.summary_text = text;
      doc.summary_generated_at = toMs(now) >= toMs(doc.retrieved_at) ? now : doc.retrieved_at;
      doc.summary_status = 'Complete';
    }

    const broken = brokenCheck();
    if (broken) {
      Object.assign(attempt, savedAttempt);
      Object.assign(doc, savedDoc);
      return pgError('23514', `new row violates check constraint (${broken})`);
    }
    return { data: 'closed', error: null };
  }

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
        return { select: (columns: string) => query(towns, columns) };
      }

      if (table === 'governing_bodies') {
        return { select: (columns: string) => query(governingBodies, columns) };
      }

      if (table === 'meetings') {
        return {
          upsert: (rows: Row[]) => {
            const saved = rows.map((row) => {
              const stored = { ...row, meeting_id: MEETING_1192_ID };
              const index = meetings.findIndex((existing) => existing.meeting_id === stored.meeting_id);
              if (index === -1) meetings.push(stored);
              else meetings[index] = stored;
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
                events.push(`documents.insert ${row.source_file_id}`);
                const duplicate = documents.some(
                  (existing) =>
                    (existing.town_id === row.town_id && existing.source_file_id === row.source_file_id) ||
                    existing.storage_path === row.storage_path,
                );
                if (duplicate) {
                  return pgError('23505', 'duplicate key value violates unique constraint');
                }
                const documentId = nextDocumentId++;
                documents.push({
                  ...row,
                  document_id: documentId,
                  retrieved_at: dbNow(),
                  summary_status: 'Pending',
                  summary_text: null,
                  summary_generated_at: null,
                });
                return { data: { document_id: documentId }, error: null };
              },
            }),
          }),
          select: (columns: string) => query(documents, columns),
        };
      }

      if (table === 'summary_attempts') {
        return {
          insert: (row: Row) => ({
            select: (columns: string) => ({
              single: async () => {
                events.push(`summary_attempts.insert ${row.document_id}`);
                attemptInsertCalls.push({ ...row });
                if (!documents.some((doc) => doc.document_id === row.document_id)) {
                  return pgError('23503', 'insert violates foreign key constraint');
                }
                if (
                  attempts.some(
                    (existing) =>
                      existing.document_id === row.document_id && existing.attempt_number === row.attempt_number,
                  )
                ) {
                  return pgError('23505', 'duplicate key value violates unique constraint');
                }
                if ((row.attempt_number as number) < 1) {
                  return pgError('23514', 'new row violates check constraint');
                }
                const stored = {
                  outcome: 'In progress',
                  started_at: dbNow(),
                  ended_at: null,
                  ...row,
                  attempt_id: nextAttemptId++,
                };
                attempts.push(stored);
                return { data: (await query([stored], columns).maybeSingle()).data, error: null };
              },
            }),
          }),
          // Compare-and-set claim: update(...).eq(...).eq(...).eq(...).select(...).
          update: (values: Row) => {
            const filters: [string, unknown][] = [];
            const builder = {
              eq(column: string, value: unknown) {
                filters.push([column, value]);
                return builder;
              },
              select: async (columns: string) => {
                const matched = attempts.filter((row) => filters.every(([column, value]) => row[column] === value));
                events.push(`summary_attempts.claim ${matched.map((row) => row.attempt_id).join(',')}`);
                for (const row of matched) Object.assign(row, values);
                const { data } = await query(matched, columns);
                return { data, error: null };
              },
            };
            return builder;
          },
        };
      }

      // The run's check row (SRS-222.1), opened and closed without assertions here.
      if (table === 'source_checks') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { check_id: 1, started_at: dbNow() }, error: null }),
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
    rpc: async (name: string, args: Row) => {
      // A successful run ends by advancing the town's baselines (SRS-404.5),
      // which this file does not test.
      if (name === 'process_successful_check') {
        return { data: null, error: null };
      }
      events.push(`rpc ${name} ${args.p_attempt_id}`);
      rpcCalls.push({ name, args: { ...args } });
      if (name !== 'finish_summary_attempt') {
        return pgError('PGRST202', `Could not find the function public.${name}`);
      }
      return finishSummaryAttempt(args);
    },
    storage: {
      from(bucket: string) {
        return {
          upload: async (path: string, body: Uint8Array, options: { upsert?: boolean }) => {
            const key = `${bucket}/${path}`;
            if (objects.has(key) && !options.upsert) {
              return { data: null, error: { message: 'The resource already exists' } };
            }
            objects.set(key, body);
            return { data: { path }, error: null };
          },
          download: async (path: string) => {
            const key = `${bucket}/${path}`;
            events.push(`storage.download ${key}`);
            if (bucket !== 'documents') {
              return { data: null, error: { status: 400, statusCode: '404', message: 'Bucket not found' } };
            }
            const bytes = objects.get(key);
            if (!bytes || hiddenObjects.has(key)) {
              return { data: null, error: { status: 400, statusCode: '404', message: 'Object not found' } };
            }
            return { data: new Blob([bytes]), error: null };
          },
        };
      },
    },
  };

  return { client, documents, attempts, objects, hiddenObjects, events, attemptInsertCalls, rpcCalls };
}

type FakeSupabase = ReturnType<typeof createFakeSupabase>;

const CONSOLE_METHODS = ['log', 'error', 'warn', 'info', 'debug'] as const;

function consoleOutput(): string {
  return CONSOLE_METHODS.flatMap((method) => vi.mocked(console[method]).mock.calls)
    .flat()
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return `${arg.message} ${arg.stack ?? ''}`;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join('\n');
}

function runRetrieval() {
  return POST(
    new Request('http://localhost/api/retrieval/meetings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer admin-token' },
      body: JSON.stringify({ townId: SALEM_TOWN_ID }),
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

// Lets the job that retrieval started without awaiting run as far as it can.
async function flushJobs() {
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function attemptsFor(fake: FakeSupabase, documentId: number) {
  return fake.attempts.filter((row) => row.document_id === documentId);
}

function documentRow(fake: FakeSupabase, documentId: number) {
  return fake.documents.find((row) => row.document_id === documentId);
}

describe('Summary generation start (SRS-204.1)', () => {
  let fake: FakeSupabase;
  let filesSeen: string[];

  // Every model call is logged in the fake's event list.
  function mockSummary(result: SummaryResult) {
    vi.mocked(summarizeDocument).mockImplementation(async () => {
      fake.events.push('model.call');
      return result;
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Network is disabled in tests');
      }),
    );
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);
    vi.stubEnv('ANTHROPIC_API_KEY', ANTHROPIC_KEY);
    vi.stubEnv('SUMMARY_MODEL', MODEL_NAME);
    for (const method of CONSOLE_METHODS) {
      vi.spyOn(console, method).mockImplementation(() => {});
    }

    fake = createFakeSupabase();
    filesSeen = [];
    vi.mocked(getSupabaseClient).mockReturnValue(fake.client as unknown as ReturnType<typeof getSupabaseClient>);
    vi.mocked(fetchMeetings).mockResolvedValue({ meetings: [MEETING_1192], complete: true, pagesRead: 1 });
    vi.mocked(downloadFile).mockImplementation(async (file: SourceFile) => {
      filesSeen.push(file.sourceFileId);
      return { bytes: fileBytes(file.sourceFileId), mimeType: 'application/pdf' };
    });
    vi.mocked(summarizeDocument).mockImplementation(async () => {
      throw new Error('summarizeDocument was not set up for this test');
    });
  });

  afterEach(() => {
    // Summary text, keys and file bytes never reach the console.
    const output = consoleOutput();
    const forbidden = [SUMMARY_120, 'SUMMARY-120-MARKER', SUMMARY_151, 'SUMMARY-151-MARKER', ANTHROPIC_KEY, MODEL_NAME];
    forbidden.push(SERVICE_ROLE_KEY, PDF_MARKER);
    for (const sourceFileId of filesSeen) {
      forbidden.push(Buffer.from(fileBytes(sourceFileId)).toString('base64'));
    }
    for (const value of forbidden) {
      expect(output).not.toContain(value);
    }

    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('records exactly one attempt for a new document before the model is called', async () => {
    let release!: (result: SummaryResult) => void;
    let atModelCall: { attempts: Row[]; status: unknown } | null = null;
    vi.mocked(summarizeDocument).mockImplementation(() => {
      fake.events.push('model.call');
      atModelCall = {
        attempts: attemptsFor(fake, 31).map((row) => ({ ...row })),
        status: documentRow(fake, 31)?.summary_status,
      };
      return new Promise<SummaryResult>((resolve) => {
        release = resolve;
      });
    });
    listFiles([FILE_1166]);

    // The model call is still held, so this resolves only because the route
    // does not await the job.
    const response = await runRetrieval();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ saved: 1, complete: true });

    await vi.waitFor(() => expect(summarizeDocument).toHaveBeenCalledTimes(1));

    expect(fake.attemptInsertCalls).toEqual([{ document_id: 31, attempt_number: 1 }]);
    expect(atModelCall).toEqual({
      attempts: [expect.objectContaining({ attempt_id: 1, attempt_number: 1, outcome: 'In progress', ended_at: null })],
      status: 'Pending',
    });

    const order = [
      'documents.insert 1166',
      'summary_attempts.insert 31',
      'summary_attempts.claim 1',
      'storage.download documents/1/1166.pdf',
      'model.call',
    ].map((event) => fake.events.indexOf(event));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    // Nothing is finished while the model call is held.
    expect(fake.rpcCalls).toHaveLength(0);

    release({ ok: true, text: SUMMARY_120, wordCount: 120 });
    await vi.waitFor(() => expect(fake.rpcCalls).toHaveLength(1));

    expect(fake.attempts).toHaveLength(1);
    expect(fake.attemptInsertCalls).toHaveLength(1);
  });

  it('stores a 120-word summary, sets the document Complete and closes the attempt as Succeeded', async () => {
    mockSummary({ ok: true, text: SUMMARY_120, wordCount: 120 });
    listFiles([FILE_1166]);

    expect((await runRetrieval()).status).toBe(200);
    await vi.waitFor(() => expect(fake.rpcCalls).toHaveLength(1));

    expect(summarizeDocument).toHaveBeenCalledTimes(1);
    expect(summarizeDocument).toHaveBeenCalledWith({
      pdfBytes: fileBytes('1166'),
      documentType: 'Agenda',
      title: 'Agenda',
      townName: 'Salem',
    });
    expect(fake.rpcCalls).toEqual([
      {
        name: 'finish_summary_attempt',
        args: { p_attempt_id: 1, p_outcome: 'Succeeded', p_summary_text: SUMMARY_120 },
      },
    ]);

    const doc = documentRow(fake, 31)!;
    expect(doc.summary_status).toBe('Complete');
    expect(doc.summary_text).toBe(SUMMARY_120);
    expect(pgWordCount(doc.summary_text as string)).toBe(120);
    expect(doc.summary_generated_at).not.toBeNull();
    expect(toMs(doc.summary_generated_at)).toBeGreaterThanOrEqual(toMs(doc.retrieved_at));

    const attempts = attemptsFor(fake, 31);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ attempt_number: 1, outcome: 'Succeeded' });
    expect(attempts[0].ended_at).not.toBeNull();
    expect(toMs(attempts[0].ended_at)).toBeGreaterThanOrEqual(toMs(attempts[0].started_at));

    expect(consoleOutput()).toContain('document 31 attempt 1 succeeded (120 words), stored, status Complete');
  });

  it('closes the attempt as Failed and stores no text when the summary is over 150 words', async () => {
    // What summarizeDocument returns for a 200-word reply (see summarize.test.ts).
    mockSummary({ ok: false, reason: 'over_word_limit', wordCount: 200 });
    listFiles([FILE_1166]);

    expect((await runRetrieval()).status).toBe(200);
    await vi.waitFor(() => expect(fake.rpcCalls).toHaveLength(1));

    expect(fake.rpcCalls[0].args).toEqual({ p_attempt_id: 1, p_outcome: 'Failed', p_summary_text: null });

    const attempts = attemptsFor(fake, 31);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].outcome).toBe('Failed');
    expect(attempts[0].ended_at).not.toBeNull();

    expect(documentRow(fake, 31)).toMatchObject({
      summary_status: 'Pending',
      summary_text: null,
      summary_generated_at: null,
    });

    expect(consoleOutput()).toContain('failed at summarize: over_word_limit, attempt closed as Failed');
  });

  it('records no attempt for a file that already has a documents row', async () => {
    // Like seeded rows 13 to 15: the row exists but its Storage path is free.
    const seeded: Row = {
      document_id: 13,
      meeting_id: MEETING_1192_ID,
      town_id: SALEM_TOWN_ID,
      source_file_id: '1166',
      title: 'Agenda',
      document_type: 'Agenda',
      source_url: MEETING_1192_PAGE,
      storage_path: '1/old-1166.pdf',
      mime_type: 'application/pdf',
      file_size_bytes: 1,
      file_sha256: '0'.repeat(64),
      retrieved_at: pgTimestamp(Date.now() - 60_000),
      summary_status: 'Pending',
      summary_text: null,
      summary_generated_at: null,
    };
    fake.documents.push({ ...seeded });
    listFiles([FILE_1166]);

    expect((await runRetrieval()).status).toBe(200);
    await flushJobs();

    expect(fake.attemptInsertCalls).toEqual([]);
    expect(fake.attempts).toEqual([]);
    expect(summarizeDocument).not.toHaveBeenCalled();
    expect(fake.rpcCalls).toEqual([]);
    expect(fake.events.filter((event) => event.startsWith('summary_attempts.claim'))).toEqual([]);
    expect(fake.documents).toEqual([seeded]);

    // Skipped before the download, so nothing is stored or inserted.
    expect(fake.objects.size).toBe(0);
    expect(fake.events.filter((event) => event.startsWith('documents.insert'))).toEqual([]);

    const output = consoleOutput();
    expect(output).toContain('town 1 file 1166 already retrieved, skipped');
    expect(output).not.toContain('failed at');
    expect(output).not.toContain('Summary start');
  });

  it('gives no second attempt to a file a later run lists again', async () => {
    mockSummary({ ok: true, text: SUMMARY_120, wordCount: 120 });

    listFiles([FILE_1166]);
    expect((await runRetrieval()).status).toBe(200);
    await vi.waitFor(() => expect(fake.rpcCalls).toHaveLength(1));
    const firstRun = { ...documentRow(fake, 31)! };
    expect(firstRun.summary_status).toBe('Complete');

    listFiles([FILE_1166, FILE_1167]);
    expect((await runRetrieval()).status).toBe(200);
    await vi.waitFor(() => expect(fake.rpcCalls).toHaveLength(2));
    await flushJobs();

    // Calls, not rows: the fake rejects a repeated attempt 1 like the real
    // table, so counting rows would pass even if a second insert were tried.
    expect(fake.attemptInsertCalls).toEqual([
      { document_id: 31, attempt_number: 1 },
      { document_id: 32, attempt_number: 1 },
    ]);
    expect(summarizeDocument).toHaveBeenCalledTimes(2);
    expect(vi.mocked(summarizeDocument).mock.calls[1][0]).toMatchObject({ title: 'Agenda Packet' });

    expect(documentRow(fake, 31)).toEqual(firstRun);
    expect(attemptsFor(fake, 31)).toEqual([expect.objectContaining({ attempt_number: 1, outcome: 'Succeeded' })]);
    expect(attemptsFor(fake, 32)).toEqual([expect.objectContaining({ attempt_number: 1, outcome: 'Succeeded' })]);

    const output = consoleOutput();
    expect(output).toContain('town 1 file 1166 already retrieved, skipped');
    expect(output).not.toContain('has no summary attempt');
  });

  it('records 6 attempts for 6 new files and starts only 5 jobs', async () => {
    mockSummary({ ok: true, text: SUMMARY_120, wordCount: 120 });
    const files = ['2001', '2002', '2003', '2004', '2005', '2006'].map((id) => makeFile(id, `Agenda ${id}`, 'Agenda'));
    listFiles(files);

    expect((await runRetrieval()).status).toBe(200);
    await vi.waitFor(() => expect(fake.rpcCalls).toHaveLength(5));
    await flushJobs();

    expect(fake.attemptInsertCalls).toEqual([31, 32, 33, 34, 35, 36].map((id) => ({ document_id: id, attempt_number: 1 })));
    expect(summarizeDocument).toHaveBeenCalledTimes(5);
    expect(fake.rpcCalls).toHaveLength(5);
    expect(attemptsFor(fake, 36)).toEqual([expect.objectContaining({ outcome: 'In progress', ended_at: null })]);
    expect(documentRow(fake, 36)?.summary_status).toBe('Pending');

    expect(consoleOutput()).toContain('recorded 6 attempts, starting 5, left 1 for POST /api/summaries/process');
  });

  it.each(['ANTHROPIC_API_KEY', 'SUMMARY_MODEL'])(
    'records the attempt but starts no job when %s is missing',
    async (name) => {
      vi.stubEnv(name, '');
      listFiles([FILE_1166]);

      expect((await runRetrieval()).status).toBe(200);
      await flushJobs();

      expect(fake.attemptInsertCalls).toEqual([{ document_id: 31, attempt_number: 1 }]);
      expect(attemptsFor(fake, 31)).toEqual([expect.objectContaining({ outcome: 'In progress', ended_at: null })]);
      expect(summarizeDocument).not.toHaveBeenCalled();
      expect(fake.rpcCalls).toEqual([]);
      expect(fake.events.filter((event) => event.startsWith('summary_attempts.claim'))).toEqual([]);

      expect(consoleOutput()).toContain(`recorded 1 attempts, started 0, missing ${name}.`);
    },
  );

  it('closes the attempt as Failed when summarizeDocument throws', async () => {
    vi.mocked(summarizeDocument).mockImplementation(async () => {
      fake.events.push('model.call');
      throw new Error('Claude API request failed (500)');
    });
    listFiles([FILE_1166]);

    expect((await runRetrieval()).status).toBe(200);
    await vi.waitFor(() => expect(fake.rpcCalls).toHaveLength(1));

    expect(fake.rpcCalls[0].args).toEqual({ p_attempt_id: 1, p_outcome: 'Failed', p_summary_text: null });
    expect(attemptsFor(fake, 31)).toEqual([expect.objectContaining({ outcome: 'Failed' })]);
    expect(documentRow(fake, 31)).toMatchObject({ summary_status: 'Pending', summary_text: null });

    expect(consoleOutput()).toContain(
      'failed at summarize: error: Claude API request failed (500), attempt closed as Failed',
    );
  });

  it('closes the attempt as Failed without calling the model when Storage answers 404', async () => {
    mockSummary({ ok: true, text: SUMMARY_120, wordCount: 120 });
    fake.hiddenObjects.add('documents/1/1166.pdf');
    listFiles([FILE_1166]);

    expect((await runRetrieval()).status).toBe(200);
    await vi.waitFor(() => expect(fake.rpcCalls).toHaveLength(1));

    expect(fake.events).toContain('storage.download documents/1/1166.pdf');
    expect(summarizeDocument).not.toHaveBeenCalled();
    expect(fake.rpcCalls[0].args).toEqual({ p_attempt_id: 1, p_outcome: 'Failed', p_summary_text: null });
    expect(attemptsFor(fake, 31)).toEqual([expect.objectContaining({ outcome: 'Failed' })]);
    expect(documentRow(fake, 31)).toMatchObject({ summary_status: 'Pending', summary_text: null });

    expect(consoleOutput()).toContain('failed at read: missing, attempt closed as Failed');
  });

  // Checks that the fake rejects what the SQL function in supabase/schema.sql
  // rejects, so a test above cannot pass on a case the real function refuses.
  describe('fake finish_summary_attempt', () => {
    function seed(documentFields: Row = {}, attemptFields: Row = {}) {
      const retrievedAt = pgTimestamp(Date.now() - 60_000);
      fake.documents.push({
        document_id: 50,
        town_id: SALEM_TOWN_ID,
        retrieved_at: retrievedAt,
        summary_status: 'Pending',
        summary_text: null,
        summary_generated_at: null,
        ...documentFields,
      });
      fake.attempts.push({
        attempt_id: 70,
        document_id: 50,
        attempt_number: 1,
        started_at: retrievedAt,
        ended_at: null,
        outcome: 'In progress',
        ...attemptFields,
      });
      return () => structuredClone({ documents: fake.documents, attempts: fake.attempts });
    }

    function finish(outcome: unknown, text: unknown) {
      return fake.client.rpc('finish_summary_attempt', {
        p_attempt_id: 70,
        p_outcome: outcome,
        p_summary_text: text,
      });
    }

    it.each([
      ['a 151-word summary', 'Succeeded', SUMMARY_151, 'summary text is over 150 words'],
      ['a blank summary', 'Succeeded', '  \n\t ', 'summary text is empty'],
      ['a Failed outcome with text', 'Failed', SUMMARY_120, 'a failed attempt takes no summary text'],
      ['an outcome other than Succeeded or Failed', 'Pending', null, 'outcome must be Succeeded or Failed'],
    ])('raises 22023 and changes nothing for %s', async (_case, outcome, text, message) => {
      const state = seed();
      const before = state();

      const { data, error } = await finish(outcome, text);

      expect(data).toBeNull();
      expect(error).toMatchObject({ code: '22023', message: `finish_summary_attempt: ${message}` });
      expect(state()).toEqual(before);
    });

    it('returns attempt_not_in_progress and changes nothing for an attempt already closed', async () => {
      const state = seed({}, { outcome: 'Failed', ended_at: pgTimestamp(Date.now()) });
      const before = state();

      expect(await finish('Succeeded', SUMMARY_120)).toEqual({ data: 'attempt_not_in_progress', error: null });
      expect(state()).toEqual(before);
    });

    it('returns document_not_pending and changes nothing for a document that is not Pending', async () => {
      const state = seed({
        summary_status: 'Complete',
        summary_text: 'An earlier summary.',
        summary_generated_at: pgTimestamp(Date.now()),
      });
      const before = state();

      expect(await finish('Succeeded', SUMMARY_120)).toEqual({ data: 'document_not_pending', error: null });
      expect(state()).toEqual(before);
    });
  });
});
