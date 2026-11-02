import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SummaryResult } from '../../lib/summaries/summarize';

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

// The Anthropic SDK is never loaded and no test reaches the Claude API.
vi.mock('../../lib/summaries/summarize', () => ({
  summarizeDocument: vi.fn(),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { summarizeDocument } from '../../lib/summaries/summarize';
import { processPendingSummaries } from '../../lib/summaries/processPendingSummaries';
import { MAX_ATTEMPTS_PER_JOB, runSummaryJob } from '../../lib/summaries/runSummaryJob';

const SALEM_TOWN_ID = 1;
const DOC_ID = 41;

// Distinctive values, so the console checks can prove none of them is logged.
const ANTHROPIC_KEY = 'test-anthropic-key-MARKER-91d2';
const MODEL_NAME = 'test-model-MARKER-55af';
const SERVICE_ROLE_KEY = 'test-service-role-key-MARKER-3b8e';
const PDF_MARKER = 'PDF-BYTES-MARKER-7c1e';
const TITLE_MARKER = 'TITLE-MARKER-0f3a';

const NOW = Date.parse('2026-11-02T15:00:00.000Z');
const MINUTE = 60 * 1000;

const SUMMARY_TEXT = ['SUMMARY-MARKER', ...Array.from({ length: 99 }, (_, i) => `council${i}`)].join(' ');
const SUCCEEDED: SummaryResult = { ok: true, text: SUMMARY_TEXT, wordCount: 100 };
const OVER_LIMIT: SummaryResult = { ok: false, reason: 'over_word_limit', wordCount: 200 };

type Row = Record<string, unknown>;

// Timestamps in the format PostgREST returns (microseconds, +00:00).
function pgTimestamp(ms: number): string {
  return new Date(ms).toISOString().replace('Z', '000+00:00');
}

// Compares timestamps by time, not by text: 'Z' and '+00:00' do not sort as strings.
function toMs(timestamp: unknown): number {
  return Date.parse(String(timestamp).replace(/(\.\d{3})\d+/, '$1'));
}

function sortValue(value: unknown): number {
  return typeof value === 'number' ? value : toMs(value);
}

function pgError(code: string, message: string) {
  return { data: null, error: { code, message, details: null } };
}

// Read query over the rows: eq, lt, order and limit, then a list or
// maybeSingle (an error for more than one row, like PostgREST).
function query(rows: Row[], columns: string) {
  const fields = columns.split(',').map((column) => column.trim());
  const filters: ((row: Row) => boolean)[] = [];
  const orders: [string, boolean][] = [];
  let limit: number | null = null;
  const project = (row: Row) => Object.fromEntries(fields.map((field) => [field, row[field]]));

  function result(): Row[] {
    const matched = rows.filter((row) => filters.every((filter) => filter(row)));
    matched.sort((a, b) => {
      for (const [column, ascending] of orders) {
        const diff = sortValue(a[column]) - sortValue(b[column]);
        if (diff !== 0) return ascending ? diff : -diff;
      }
      return 0;
    });
    return (limit === null ? matched : matched.slice(0, limit)).map(project);
  }

  const builder = {
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return builder;
    },
    lt(column: string, value: unknown) {
      filters.push((row) => toMs(row[column]) < toMs(value));
      return builder;
    },
    order(column: string, options: { ascending: boolean }) {
      orders.push([column, options.ascending]);
      return builder;
    },
    limit(count: number) {
      limit = count;
      return builder;
    },
    maybeSingle: async () => {
      const found = result();
      if (found.length > 1) return pgError('PGRST116', 'JSON object requested, multiple rows returned');
      return { data: found[0] ?? null, error: null };
    },
    then<T>(resolve: (value: { data: Row[]; error: null }) => T, reject?: (reason: unknown) => T) {
      return Promise.resolve({ data: result(), error: null }).then(resolve, reject);
    },
  };
  return builder;
}

// Fake Supabase client for the summary job. summary_attempts applies the
// checks and the unique index from supabase/schema.sql, and
// rpc('finish_summary_attempt') follows the SQL function statement by
// statement. After every write it records the most In progress attempts any
// document had, and every attempt_number it was asked to store. Anything not
// faked throws, so an unexpected call fails the test.
function createFakeSupabase() {
  const towns: Row[] = [{ town_id: SALEM_TOWN_ID, name: 'Salem' }];
  const documents: Row[] = [];
  const attempts: Row[] = [];
  const objects = new Map<string, Uint8Array>();
  const rpcResults: unknown[] = [];
  const attemptNumbersWritten: number[] = [];
  let maxRunningPerDocument = 0;
  let nextAttemptId = 100;

  const dbNow = () => pgTimestamp(Date.now());

  function recordRunning() {
    const counts = new Map<unknown, number>();
    for (const row of attempts) {
      if (row.outcome === 'In progress') counts.set(row.document_id, (counts.get(row.document_id) ?? 0) + 1);
    }
    maxRunningPerDocument = Math.max(maxRunningPerDocument, ...counts.values(), 0);
  }

  function addDocument(fields: Row = {}) {
    const row: Row = {
      document_id: DOC_ID,
      town_id: SALEM_TOWN_ID,
      title: `Agenda ${TITLE_MARKER}`,
      document_type: 'Agenda',
      storage_path: `${SALEM_TOWN_ID}/${String(fields.document_id ?? DOC_ID)}.pdf`,
      mime_type: 'application/pdf',
      retrieved_at: pgTimestamp(NOW - 60 * MINUTE),
      summary_status: 'Pending',
      summary_text: null,
      summary_generated_at: null,
      ...fields,
    };
    documents.push(row);
    objects.set(`documents/${row.storage_path}`, new TextEncoder().encode(`%PDF-1.4 ${PDF_MARKER} ${row.document_id}`));
    return row;
  }

  function addAttempt(fields: Row) {
    const row: Row = {
      attempt_id: nextAttemptId++,
      document_id: DOC_ID,
      attempt_number: 1,
      started_at: pgTimestamp(NOW - 20 * MINUTE),
      ended_at: null,
      claimed_at: null,
      outcome: 'In progress',
      ...fields,
    };
    attempts.push(row);
    recordRunning();
    return row;
  }

  function finishSummaryAttempt(args: Row) {
    const { p_attempt_id: attemptId, p_outcome: outcome, p_summary_text: text } = args;
    if (outcome === 'Succeeded') {
      if (typeof text !== 'string' || !/\S/.test(text)) return pgError('22023', 'summary text is empty');
    } else if (outcome === 'Failed') {
      if (text !== null) return pgError('22023', 'a failed attempt takes no summary text');
    } else {
      return pgError('22023', 'outcome must be Succeeded or Failed');
    }

    const attempt = attempts.find((row) => row.attempt_id === attemptId);
    if (!attempt) return { data: 'attempt_not_found', error: null };
    if (attempt.outcome !== 'In progress') return { data: 'attempt_not_in_progress', error: null };

    const doc = documents.find((row) => row.document_id === attempt.document_id)!;
    if (doc.summary_status !== 'Pending') return { data: 'document_not_pending', error: null };

    const now = dbNow();
    attempt.outcome = outcome;
    attempt.ended_at = toMs(now) >= toMs(attempt.started_at) ? now : attempt.started_at;

    if (outcome === 'Succeeded') {
      doc.summary_text = text;
      doc.summary_generated_at = now;
      doc.summary_status = 'Complete';
      return { data: 'closed', error: null };
    }

    const own = attempts.filter((row) => row.document_id === doc.document_id);
    const lastSucceeded = Math.max(
      0,
      ...own.filter((row) => row.outcome === 'Succeeded').map((row) => row.attempt_number as number),
    );
    const failures = own.filter(
      (row) => row.outcome === 'Failed' && (row.attempt_number as number) > lastSucceeded,
    ).length;
    const nextNumber = Math.max(...own.map((row) => row.attempt_number as number)) + 1;

    if (failures < 3 && nextNumber <= 3) {
      attemptNumbersWritten.push(nextNumber);
      attempts.push({
        attempt_id: nextAttemptId++,
        document_id: doc.document_id,
        attempt_number: nextNumber,
        started_at: now,
        ended_at: null,
        claimed_at: null,
        outcome: 'In progress',
      });
      return { data: 'retry', error: null };
    }

    doc.summary_status = 'Failed';
    return { data: 'failed', error: null };
  }

  const client = {
    from(table: string) {
      if (table === 'towns') {
        return { select: (columns: string) => query(towns, columns) };
      }
      if (table === 'documents') {
        return { select: (columns: string) => query(documents, columns) };
      }
      if (table === 'summary_attempts') {
        return {
          select: (columns: string) => query(attempts, columns),
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
                for (const row of matched) Object.assign(row, values);
                const { data } = await query(matched, columns);
                return { data, error: null };
              },
            };
            return builder;
          },
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    rpc: async (name: string, args: Row) => {
      if (name !== 'finish_summary_attempt') {
        return pgError('PGRST202', `Could not find the function public.${name}`);
      }
      const result = finishSummaryAttempt(args);
      rpcResults.push(result.data);
      recordRunning();
      return result;
    },
    storage: {
      from(bucket: string) {
        return {
          download: async (path: string) => {
            const bytes = objects.get(`${bucket}/${path}`);
            if (!bytes) {
              return { data: null, error: { status: 400, statusCode: '404', message: 'Object not found' } };
            }
            return { data: new Blob([bytes]), error: null };
          },
        };
      },
    },
  };

  return {
    client,
    documents,
    attempts,
    objects,
    rpcResults,
    attemptNumbersWritten,
    addDocument,
    addAttempt,
    maxRunning: () => maxRunningPerDocument,
  };
}

type FakeSupabase = ReturnType<typeof createFakeSupabase>;

const CONSOLE_METHODS = ['log', 'error', 'warn', 'info', 'debug'] as const;

function consoleOutput(): string {
  return CONSOLE_METHODS.flatMap((method) => vi.mocked(console[method]).mock.calls)
    .flat()
    .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
    .join('\n');
}

describe('Failed summary status (SRS-210.1)', () => {
  let fake: FakeSupabase;

  function attemptsFor(documentId = DOC_ID) {
    return fake.attempts
      .filter((row) => row.document_id === documentId)
      .sort((a, b) => (a.attempt_number as number) - (b.attempt_number as number));
  }

  function documentRow(documentId = DOC_ID) {
    return fake.documents.find((row) => row.document_id === documentId)!;
  }

  // Each model call yields once, so overlapping callers interleave.
  function mockModel(...results: SummaryResult[]) {
    let call = 0;
    vi.mocked(summarizeDocument).mockImplementation(async () => {
      await new Promise((resolve) => setImmediate(resolve));
      const result = results[Math.min(call, results.length - 1)];
      call += 1;
      return result;
    });
  }

  function asInProgress(row: Row) {
    return {
      attemptId: row.attempt_id as number,
      documentId: row.document_id as number,
      startedAt: row.started_at as string,
      claimedAt: row.claimed_at as string | null,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Network is disabled in tests');
      }),
    );
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY);
    vi.stubEnv('SUMMARY_API_KEY', ANTHROPIC_KEY);
    vi.stubEnv('SUMMARY_MODEL', MODEL_NAME);
    for (const method of CONSOLE_METHODS) {
      vi.spyOn(console, method).mockImplementation(() => {});
    }

    fake = createFakeSupabase();
    vi.mocked(getSupabaseClient).mockReturnValue(fake.client as unknown as ReturnType<typeof getSupabaseClient>);
    vi.mocked(summarizeDocument).mockImplementation(async () => {
      throw new Error('summarizeDocument was not set up for this test');
    });
  });

  afterEach(() => {
    // Never two running attempts for one document, never a fourth attempt.
    expect(fake.maxRunning()).toBeLessThanOrEqual(1);
    expect(fake.attempts.every((row) => (row.attempt_number as number) <= 3)).toBe(true);
    expect(fake.attemptNumbersWritten.every((number) => number <= 3)).toBe(true);

    // Summary text, keys, titles and file bytes never reach the console.
    const output = consoleOutput();
    for (const value of [SUMMARY_TEXT, 'SUMMARY-MARKER', ANTHROPIC_KEY, MODEL_NAME, SERVICE_ROLE_KEY, PDF_MARKER]) {
      expect(output).not.toContain(value);
    }
    expect(output).not.toContain(TITLE_MARKER);

    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sets the status to Failed when attempts 1, 2 and 3 fail, with exactly 3 attempt rows', async () => {
    fake.addDocument();
    fake.addAttempt({ attempt_number: 1 });
    mockModel(OVER_LIMIT);

    expect(await processPendingSummaries()).toEqual({ kind: 'processed', processed: [DOC_ID] });

    expect(summarizeDocument).toHaveBeenCalledTimes(3);
    expect(fake.rpcResults).toEqual(['retry', 'retry', 'failed']);

    const rows = attemptsFor();
    expect(rows.map((row) => row.attempt_number)).toEqual([1, 2, 3]);
    expect(rows.map((row) => row.outcome)).toEqual(['Failed', 'Failed', 'Failed']);
    expect(rows.every((row) => row.ended_at !== null)).toBe(true);

    expect(documentRow()).toMatchObject({ summary_status: 'Failed', summary_text: null, summary_generated_at: null });

    const output = consoleOutput();
    expect(output).toContain(`document ${DOC_ID} status Failed after 3 failed attempts`);

    // An hour later nothing is left to run and no fourth attempt appears.
    vi.setSystemTime(NOW + 60 * MINUTE);
    expect(await processPendingSummaries()).toEqual({ kind: 'processed', processed: [] });
    expect(attemptsFor()).toHaveLength(3);
    expect(summarizeDocument).toHaveBeenCalledTimes(3);
  });

  it('sets the status to Complete when attempt 2 succeeds, with no attempt 3', async () => {
    fake.addDocument();
    fake.addAttempt({ attempt_number: 1 });
    mockModel(OVER_LIMIT, SUCCEEDED);

    await processPendingSummaries();

    expect(summarizeDocument).toHaveBeenCalledTimes(2);
    expect(attemptsFor().map((row) => [row.attempt_number, row.outcome])).toEqual([
      [1, 'Failed'],
      [2, 'Succeeded'],
    ]);
    expect(documentRow()).toMatchObject({ summary_status: 'Complete', summary_text: SUMMARY_TEXT });
  });

  it('gives 3 Failed attempts and never calls the model when the stored file is missing', async () => {
    fake.addDocument();
    fake.objects.clear();
    fake.addAttempt({ attempt_number: 1 });
    mockModel(SUCCEEDED);

    await processPendingSummaries();

    expect(summarizeDocument).not.toHaveBeenCalled();
    expect(attemptsFor().map((row) => row.outcome)).toEqual(['Failed', 'Failed', 'Failed']);
    expect(documentRow()).toMatchObject({ summary_status: 'Failed', summary_text: null });
    expect(consoleOutput()).toContain('failed at read: missing, attempt closed as Failed');
  });

  it('closes a stale attempt a job claimed and did not finish as Failed at stage timeout, then runs the next', async () => {
    fake.addDocument();
    const stuck = fake.addAttempt({ attempt_number: 1, claimed_at: pgTimestamp(NOW - 20 * MINUTE) });
    mockModel(SUCCEEDED);

    expect(await processPendingSummaries()).toEqual({ kind: 'processed', processed: [DOC_ID] });

    // The stuck attempt counts as a failure without a model call; attempt 2 runs.
    expect(summarizeDocument).toHaveBeenCalledTimes(1);
    expect(attemptsFor().map((row) => [row.attempt_number, row.outcome])).toEqual([
      [1, 'Failed'],
      [2, 'Succeeded'],
    ]);
    expect(documentRow().summary_status).toBe('Complete');
    expect(consoleOutput()).toContain(
      `document ${DOC_ID} attempt ${stuck.attempt_id} failed at timeout: not_finished, attempt closed as Failed`,
    );
  });

  it('sets the status to Failed when a stuck attempt 3 times out after two failures', async () => {
    fake.addDocument();
    for (const number of [1, 2]) {
      fake.addAttempt({
        attempt_number: number,
        outcome: 'Failed',
        started_at: pgTimestamp(NOW - 50 * MINUTE),
        ended_at: pgTimestamp(NOW - 45 * MINUTE),
        claimed_at: pgTimestamp(NOW - 50 * MINUTE),
      });
    }
    fake.addAttempt({ attempt_number: 3, claimed_at: pgTimestamp(NOW - 20 * MINUTE) });
    mockModel(SUCCEEDED);

    await processPendingSummaries();

    expect(summarizeDocument).not.toHaveBeenCalled();
    expect(fake.rpcResults).toEqual(['failed']);
    expect(attemptsFor().map((row) => row.outcome)).toEqual(['Failed', 'Failed', 'Failed']);
    expect(documentRow().summary_status).toBe('Failed');
  });

  it('runs a stale attempt that was never claimed instead of failing it', async () => {
    fake.addDocument();
    const waiting = fake.addAttempt({ attempt_number: 1, claimed_at: null });
    mockModel(SUCCEEDED);

    await processPendingSummaries();

    expect(summarizeDocument).toHaveBeenCalledTimes(1);
    expect(attemptsFor()).toHaveLength(1);
    expect(attemptsFor()[0]).toMatchObject({ attempt_id: waiting.attempt_id, outcome: 'Succeeded' });
    expect(attemptsFor()[0].claimed_at).not.toBeNull();
    expect(documentRow().summary_status).toBe('Complete');
    expect(consoleOutput()).not.toContain('timeout');
  });

  it('gives a Complete document no new attempt', async () => {
    fake.addDocument({
      summary_status: 'Complete',
      summary_text: 'An earlier summary.',
      summary_generated_at: pgTimestamp(NOW),
    });
    fake.addAttempt({
      attempt_number: 1,
      outcome: 'Succeeded',
      ended_at: pgTimestamp(NOW - 19 * MINUTE),
    });
    // A leftover running attempt, claimed long ago.
    const leftover = fake.addAttempt({ attempt_number: 2, claimed_at: pgTimestamp(NOW - 20 * MINUTE) });
    mockModel(OVER_LIMIT);
    const before = structuredClone(fake.documents);

    await processPendingSummaries();

    expect(summarizeDocument).not.toHaveBeenCalled();
    expect(fake.rpcResults).toEqual(['document_not_pending']);
    expect(attemptsFor()).toHaveLength(2);
    expect(fake.documents).toEqual(before);

    // A Failed finish on it changes nothing either.
    expect(
      await fake.client.rpc('finish_summary_attempt', {
        p_attempt_id: leftover.attempt_id,
        p_outcome: 'Failed',
        p_summary_text: null,
      }),
    ).toEqual({ data: 'document_not_pending', error: null });
    expect(attemptsFor()).toHaveLength(2);
  });

  it('leaves at most one In progress attempt when two processors overlap', async () => {
    fake.addDocument();
    fake.addAttempt({ attempt_number: 1 });
    mockModel(OVER_LIMIT);

    const results = await Promise.all([processPendingSummaries(), processPendingSummaries()]);

    // One claim wins; the other caller skips the document.
    expect(results.map((result) => (result.kind === 'processed' ? result.processed : null)).sort()).toEqual([
      [],
      [DOC_ID],
    ]);
    expect(summarizeDocument).toHaveBeenCalledTimes(3);
    expect(fake.maxRunning()).toBe(1);
    expect(attemptsFor().map((row) => row.outcome)).toEqual(['Failed', 'Failed', 'Failed']);
    expect(documentRow().summary_status).toBe('Failed');
  });

  it('never runs more than 3 attempts, however often the job and the processor run', async () => {
    expect(MAX_ATTEMPTS_PER_JOB).toBe(3);
    fake.addDocument();
    const first = fake.addAttempt({ attempt_number: 1 });
    mockModel(OVER_LIMIT);

    await runSummaryJob(fake.client as never, asInProgress(first));
    for (let run = 1; run <= 5; run++) {
      vi.setSystemTime(NOW + run * 20 * MINUTE);
      await processPendingSummaries();
    }

    expect(summarizeDocument).toHaveBeenCalledTimes(3);
    expect(attemptsFor().map((row) => row.attempt_number)).toEqual([1, 2, 3]);
    expect(documentRow().summary_status).toBe('Failed');

    // The same attempt again is refused, and nothing is added.
    const outcome = await runSummaryJob(fake.client as never, asInProgress(first));
    expect(outcome).toEqual({ kind: 'skipped', documentId: DOC_ID, reason: 'not_claimed' });
    expect(attemptsFor()).toHaveLength(3);
  });
});
