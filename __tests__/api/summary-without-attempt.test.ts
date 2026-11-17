import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

// No model call here: each job is replaced, and the test only checks which
// attempts reach it.
vi.mock('../../lib/summaries/runSummaryJob', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/summaries/runSummaryJob')>();
  return { ...actual, runSummaryJob: vi.fn() };
});

import { getSupabaseClient } from '../../lib/supabase';
import { STALE_ATTEMPT_MINUTES, findDocumentsWithoutAttempt } from '../../lib/summaries/attempts';
import { processPendingSummaries } from '../../lib/summaries/processPendingSummaries';
import {
  MAX_SUMMARIES_PER_PROCESS_CALL,
  createSummaryStarter,
  runSummaryJob,
  type SummaryJobOutcome,
} from '../../lib/summaries/runSummaryJob';

type Row = Record<string, unknown>;

const MINUTE = 60 * 1000;
const NOW = Date.parse('2026-11-16T15:00:00Z');

function minutesAgo(minutes: number): string {
  return new Date(NOW - minutes * MINUTE).toISOString();
}

// Read query over a copy of the rows: eq, lt, in, order and limit, then the
// select's columns. Awaiting it gives { data, error }.
function query(rows: Row[], columns: string, failWith: string | null) {
  const fields = columns.split(',').map((column) => column.trim());
  let result = [...rows];
  let limit: number | null = null;
  const builder = {
    eq(column: string, value: unknown) {
      result = result.filter((row) => row[column] === value);
      return builder;
    },
    lt(column: string, value: string) {
      result = result.filter((row) => Date.parse(String(row[column])) < Date.parse(value));
      return builder;
    },
    in(column: string, values: unknown[]) {
      result = result.filter((row) => values.includes(row[column]));
      return builder;
    },
    order(column: string, options: { ascending: boolean }) {
      const sign = options.ascending ? 1 : -1;
      result = [...result].sort((a, b) => {
        const left = a[column] as string | number;
        const right = b[column] as string | number;
        return left < right ? -sign : left > right ? sign : 0;
      });
      return builder;
    },
    limit(count: number) {
      limit = count;
      return builder;
    },
    then<T>(resolve: (value: { data: Row[] | null; error: { message: string } | null }) => T, reject?: (r: unknown) => T) {
      const value = failWith
        ? { data: null, error: { message: failWith } }
        : {
            data: (limit === null ? result : result.slice(0, limit)).map((row) =>
              Object.fromEntries(fields.map((field) => [field, row[field]])),
            ),
            error: null,
          };
      return Promise.resolve(value).then(resolve, reject);
    },
  };
  return builder;
}

// Fake Supabase with documents and summary_attempts only. insertFailures is
// how many summary_attempts inserts fail before they start to work.
function createFakeSupabase(documents: Row[], attempts: Row[] = []) {
  let nextAttemptId = 100;
  const state = {
    insertFailures: 0,
    failDocumentsRead: null as string | null,
    inserts: [] as Row[],
  };

  const client = {
    from(table: string) {
      if (table === 'documents') {
        return { select: (columns: string) => query(documents, columns, state.failDocumentsRead) };
      }
      if (table === 'summary_attempts') {
        return {
          select: (columns: string) => query(attempts, columns, null),
          insert: (row: Row) => ({
            select: (columns: string) => ({
              single: async () => {
                state.inserts.push({ ...row });
                if (state.insertFailures > 0) {
                  state.insertFailures -= 1;
                  return { data: null, error: { code: '08006', message: 'connection failure' } };
                }
                const stored: Row = {
                  attempt_id: nextAttemptId++,
                  outcome: 'In progress',
                  started_at: new Date(NOW).toISOString(),
                  claimed_at: null,
                  ...row,
                };
                attempts.push(stored);
                const fields = columns.split(',').map((column) => column.trim());
                return { data: Object.fromEntries(fields.map((field) => [field, stored[field]])), error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  return { client, attempts, state };
}

function pendingDocument(documentId: number, retrievedMinutesAgo: number): Row {
  return { document_id: documentId, summary_status: 'Pending', retrieved_at: minutesAgo(retrievedMinutesAgo) };
}

function inProgressAttempt(attemptId: number, documentId: number, startedMinutesAgo: number): Row {
  return {
    attempt_id: attemptId,
    document_id: documentId,
    attempt_number: 1,
    outcome: 'In progress',
    started_at: minutesAgo(startedMinutesAgo),
    claimed_at: null,
  };
}

function jobDocumentIds(): number[] {
  return vi.mocked(runSummaryJob).mock.calls.map(([, attempt]) => attempt.documentId);
}

const CONSOLE_METHODS = ['log', 'error', 'warn', 'info', 'debug'] as const;

function consoleText(): string {
  return CONSOLE_METHODS.flatMap((method) => vi.mocked(console[method]).mock.calls)
    .flat()
    .map(String)
    .join('\n');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('SUMMARY_API_KEY', 'test-key');
  vi.stubEnv('SUMMARY_MODEL', 'test-model');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role');
  for (const method of CONSOLE_METHODS) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
  vi.mocked(runSummaryJob).mockImplementation(
    async (_supabase, attempt) =>
      ({
        kind: 'succeeded',
        attemptId: attempt.attemptId,
        documentId: attempt.documentId,
        text: 'summary',
        wordCount: 1,
        finish: 'closed',
      }) as SummaryJobOutcome,
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('findDocumentsWithoutAttempt (SRS-204.1, #513)', () => {
  it('returns Pending documents with no summary attempt, oldest first', async () => {
    const fake = createFakeSupabase(
      [
        pendingDocument(15, 60 * 24 * 34),
        pendingDocument(13, 60 * 24 * 35),
        pendingDocument(14, 60 * 24 * 34),
        pendingDocument(20, 60),
      ],
      [inProgressAttempt(1, 20, 30)],
    );

    const ids = await findDocumentsWithoutAttempt(fake.client as never, 10);

    expect(ids).toEqual([13, 14, 15]);
  });

  it('leaves out documents retrieved inside the stale window, so a running retrieval can record their attempt', async () => {
    const fake = createFakeSupabase([
      pendingDocument(31, STALE_ATTEMPT_MINUTES - 1),
      pendingDocument(32, STALE_ATTEMPT_MINUTES + 1),
    ]);

    expect(await findDocumentsWithoutAttempt(fake.client as never, 10)).toEqual([32]);
  });

  it('leaves out Complete and Failed documents and documents whose attempts all finished', async () => {
    const fake = createFakeSupabase(
      [
        { document_id: 40, summary_status: 'Complete', retrieved_at: minutesAgo(600) },
        { document_id: 41, summary_status: 'Failed', retrieved_at: minutesAgo(600) },
        pendingDocument(42, 600),
      ],
      [{ ...inProgressAttempt(5, 42, 500), outcome: 'Failed' }],
    );

    expect(await findDocumentsWithoutAttempt(fake.client as never, 10)).toEqual([]);
  });

  it('returns at most limit documents, and none for a limit of 0', async () => {
    const fake = createFakeSupabase([pendingDocument(1, 100), pendingDocument(2, 90), pendingDocument(3, 80)]);

    expect(await findDocumentsWithoutAttempt(fake.client as never, 2)).toEqual([1, 2]);
    expect(await findDocumentsWithoutAttempt(fake.client as never, 0)).toEqual([]);
  });

  it('throws when the documents read fails', async () => {
    const fake = createFakeSupabase([pendingDocument(1, 100)]);
    fake.state.failDocumentsRead = 'timeout';

    await expect(findDocumentsWithoutAttempt(fake.client as never, 5)).rejects.toThrow('timeout');
  });
});

describe('processPendingSummaries picks up documents with no attempt (SRS-204.1, #513)', () => {
  it('gives each Pending document with no attempt attempt 1 and runs it (the #513 case)', async () => {
    const fake = createFakeSupabase([
      pendingDocument(13, 60 * 24 * 34),
      pendingDocument(14, 60 * 24 * 34),
      pendingDocument(15, 60 * 24 * 34),
    ]);
    vi.mocked(getSupabaseClient).mockReturnValue(fake.client as never);

    const result = await processPendingSummaries();

    expect(fake.state.inserts).toEqual([
      { document_id: 13, attempt_number: 1 },
      { document_id: 14, attempt_number: 1 },
      { document_id: 15, attempt_number: 1 },
    ]);
    expect(jobDocumentIds()).toEqual([13, 14, 15]);
    expect(result).toEqual({ kind: 'processed', processed: [13, 14, 15] });
  });

  it('runs stale In progress attempts first, then fills the per-call cap with documents that have none', async () => {
    const documents = [pendingDocument(1, 300), pendingDocument(2, 300)];
    const attempts = [inProgressAttempt(10, 1, 200), inProgressAttempt(11, 2, 200)];
    for (let id = 50; id < 50 + MAX_SUMMARIES_PER_PROCESS_CALL; id++) {
      documents.push(pendingDocument(id, 400));
    }
    const fake = createFakeSupabase(documents, attempts);
    vi.mocked(getSupabaseClient).mockReturnValue(fake.client as never);

    await processPendingSummaries();

    expect(jobDocumentIds()).toHaveLength(MAX_SUMMARIES_PER_PROCESS_CALL);
    expect(jobDocumentIds().slice(0, 2)).toEqual([1, 2]);
    expect(fake.state.inserts).toHaveLength(MAX_SUMMARIES_PER_PROCESS_CALL - 2);
  });

  it('does not insert anything when the stale attempts already fill the cap', async () => {
    const documents: Row[] = [pendingDocument(99, 400)];
    const attempts: Row[] = [];
    for (let id = 1; id <= MAX_SUMMARIES_PER_PROCESS_CALL; id++) {
      documents.push(pendingDocument(id, 300));
      attempts.push(inProgressAttempt(id, id, 200));
    }
    const fake = createFakeSupabase(documents, attempts);
    vi.mocked(getSupabaseClient).mockReturnValue(fake.client as never);

    await processPendingSummaries();

    expect(fake.state.inserts).toEqual([]);
    expect(jobDocumentIds()).not.toContain(99);
  });

  it('logs a failed insert and still runs the other documents', async () => {
    const fake = createFakeSupabase([pendingDocument(13, 600), pendingDocument(14, 600)]);
    fake.state.insertFailures = 1;
    vi.mocked(getSupabaseClient).mockReturnValue(fake.client as never);

    const result = await processPendingSummaries();

    expect(jobDocumentIds()).toEqual([14]);
    expect(result).toEqual({ kind: 'processed', processed: [14] });
    expect(consoleText()).toContain('document 13');
  });

  it('logs a failed read of documents with no attempt and still runs the stale attempts', async () => {
    const fake = createFakeSupabase([pendingDocument(1, 300)], [inProgressAttempt(10, 1, 200)]);
    fake.state.failDocumentsRead = 'documents read timed out';
    vi.mocked(getSupabaseClient).mockReturnValue(fake.client as never);

    const result = await processPendingSummaries();

    expect(result).toEqual({ kind: 'processed', processed: [1] });
    expect(consoleText()).toContain('documents read timed out');
  });
});

describe('recordAttempt retries a failed first-attempt insert once (SRS-204.1, #513)', () => {
  it('records the attempt when the second insert works', async () => {
    const fake = createFakeSupabase([pendingDocument(60, 0)]);
    fake.state.insertFailures = 1;
    vi.stubEnv('SUMMARY_API_KEY', '');
    const starter = createSummaryStarter(fake.client as never, 1);

    await starter.recordAttempt(60);
    starter.startJobs();

    expect(fake.state.inserts).toHaveLength(2);
    expect(fake.attempts.map((row) => row.document_id)).toEqual([60]);
    expect(consoleText()).toContain('recorded 1 attempts');
    expect(consoleText()).not.toContain('has no summary attempt');
  });

  it('gives up after two failed inserts, logs it and does not throw', async () => {
    const fake = createFakeSupabase([pendingDocument(61, 0)]);
    fake.state.insertFailures = 2;
    const starter = createSummaryStarter(fake.client as never, 1);

    await expect(starter.recordAttempt(61)).resolves.toBeUndefined();
    starter.startJobs();

    expect(fake.state.inserts).toHaveLength(2);
    expect(fake.attempts).toEqual([]);
    expect(consoleText()).toContain('Summary start: document 61 has no summary attempt');
  });
});
