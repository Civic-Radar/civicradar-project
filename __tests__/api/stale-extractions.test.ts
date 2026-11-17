// Tests for bug #517 (SRS-306.1, AO, Extraction status display): an extraction
// stayed "Processing" forever when the server stopped in the middle of a run.
//
// failStaleExtractions ends an extraction that is still Processing long after it
// was requested as Failed, so its status moves on, the failure message and Retry
// can be shown, and its document can be requested again.
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_STALE_MINUTES, failStaleExtractions, staleAfterMinutes, staleBefore } from '../../lib/extraction/staleExtractions';

type Row = Record<string, unknown>;

// In-memory extractions table with the one update failStaleExtractions makes.
function database(rows: Row[], fail: 'error' | 'throw' | null = null) {
  const from = () => {
    let values: Row = {};
    const filters: ((row: Row) => boolean)[] = [];
    const query = {
      update: (v: Row) => { values = v; return query; },
      eq: (column: string, value: unknown) => { filters.push((r) => r[column] === value); return query; },
      lt: (column: string, value: string) => { filters.push((r) => String(r[column]) < value); return query; },
      select: () => query,
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        if (fail === 'throw') return Promise.reject(new Error('down')).then(resolve, reject);
        if (fail === 'error') return Promise.resolve({ data: null, error: { message: 'down' } }).then(resolve, reject);
        const hit = rows.filter((r) => filters.every((f) => f(r)));
        hit.forEach((r) => Object.assign(r, values));
        return Promise.resolve({ data: hit.map((r) => ({ extraction_id: r.extraction_id })), error: null }).then(resolve, reject);
      },
    };
    return query;
  };
  return { from } as unknown as SupabaseClient;
}

const NOW = new Date('2026-11-10T18:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const extraction = (row: Row): Row => ({
  extraction_id: 81, user_id: 'user-a', document_id: 7, status: 'Processing',
  failure_cause: null, completed_at: null, requested_at: minutesAgo(60), ...row,
});

afterEach(() => vi.unstubAllEnvs());

describe('Bug #517: an extraction left Processing by a stopped server ends as Failed', () => {
  it('ends an extraction that has been Processing for an hour as Failed', async () => {
    const rows = [extraction({})];
    expect(await failStaleExtractions(database(rows), 'user-a', NOW)).toBe(1);
    expect(rows[0]).toMatchObject({ status: 'Failed', failure_cause: 'Other', completed_at: NOW.toISOString() });
  });

  it('leaves an extraction that started a minute ago Processing', async () => {
    const rows = [extraction({ requested_at: minutesAgo(1) })];
    expect(await failStaleExtractions(database(rows), 'user-a', NOW)).toBe(0);
    expect(rows[0]).toMatchObject({ status: 'Processing', failure_cause: null, completed_at: null });
  });

  it('waits 10 minutes by default', async () => {
    expect(DEFAULT_STALE_MINUTES).toBe(10);
    const rows = [extraction({ extraction_id: 1, requested_at: minutesAgo(9) }), extraction({ extraction_id: 2, requested_at: minutesAgo(11) })];
    await failStaleExtractions(database(rows), 'user-a', NOW);
    expect(rows.map((r) => r.status)).toEqual(['Processing', 'Failed']);
  });

  it.each(['Queued', 'Completed'])('does not change an old %s extraction', async (status) => {
    const rows = [extraction({ status, completed_at: status === 'Completed' ? minutesAgo(59) : null })];
    expect(await failStaleExtractions(database(rows), 'user-a', NOW)).toBe(0);
    expect(rows[0].status).toBe(status);
  });

  it('does not change an extraction that already Failed, so its cause is kept', async () => {
    const rows = [extraction({ status: 'Failed', failure_cause: 'Unreadable file', completed_at: minutesAgo(59) })];
    await failStaleExtractions(database(rows), 'user-a', NOW);
    expect(rows[0]).toMatchObject({ status: 'Failed', failure_cause: 'Unreadable file', completed_at: minutesAgo(59) });
  });

  it("does not change another user's extractions", async () => {
    const rows = [extraction({ user_id: 'someone-else' })];
    expect(await failStaleExtractions(database(rows), 'user-a', NOW)).toBe(0);
    expect(rows[0].status).toBe('Processing');
  });

  it('the wait can be changed with EXTRACTION_STALE_MINUTES', async () => {
    vi.stubEnv('EXTRACTION_STALE_MINUTES', '2');
    expect(staleAfterMinutes()).toBe(2);
    expect(staleBefore(NOW).toISOString()).toBe(minutesAgo(2));
    const rows = [extraction({ requested_at: minutesAgo(3) })];
    await failStaleExtractions(database(rows), 'user-a', NOW);
    expect(rows[0].status).toBe('Failed');
  });

  it('uses 10 minutes when EXTRACTION_STALE_MINUTES is missing or not a positive number', () => {
    expect(staleAfterMinutes()).toBe(10);
    vi.stubEnv('EXTRACTION_STALE_MINUTES', 'soon');
    expect(staleAfterMinutes()).toBe(10);
    vi.stubEnv('EXTRACTION_STALE_MINUTES', '0');
    expect(staleAfterMinutes()).toBe(10);
  });

  it.each(['error', 'throw'] as const)('does not fail the page when the database answers with an %s', async (fail) => {
    expect(await failStaleExtractions(database([extraction({})], fail), 'user-a', NOW)).toBe(0);
  });
});
