// Tests for bug #527 (SRS-301.7, AO, Daily extraction limit): after a reload the
// extraction page enabled Request extraction again, because it only learned the
// limit was reached from a refused request.
//
// The page now loads whether today's limit is reached (dailyLimitReached), so the
// message stays and the request control stays disabled for the rest of the day.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dailyLimitReached } from '../../lib/extraction/dailyLimit';

const NOW = new Date('2026-10-27T18:00:00Z'); // 2:00 PM in Salem
type Row = { user_id: string; requested_at: string };

// A database with the one query the count makes: the user's requests since a time.
function database(rows: Row[], fail = false) {
  const from = () => {
    const filters: ((row: Row) => boolean)[] = [];
    const query = {
      select: () => query,
      eq: (_column: string, value: string) => { filters.push((r) => r.user_id === value); return query; },
      gte: (_column: string, value: string) => { filters.push((r) => r.requested_at >= value); return query; },
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(fail ? { count: null, error: { message: 'down' } } : { count: rows.filter((r) => filters.every((f) => f(r))).length, error: null }).then(resolve),
    };
    return query;
  };
  return { from } as unknown as SupabaseClient;
}

const requests = (count: number, requestedAt: string, userId = 'user-a'): Row[] =>
  Array.from({ length: count }, () => ({ user_id: userId, requested_at: requestedAt }));

afterEach(() => vi.unstubAllEnvs());

describe("Bug #527: the page knows today's limit is reached when it loads", () => {
  it('is reached after 10 requests today', async () => {
    expect(await dailyLimitReached(database(requests(10, '2026-10-27T13:00:00Z')), 'user-a', NOW)).toBe(true);
  });

  it('is not reached after 9 requests today', async () => {
    expect(await dailyLimitReached(database(requests(9, '2026-10-27T13:00:00Z')), 'user-a', NOW)).toBe(false);
  });

  it("is not reached by yesterday's requests, so the control is enabled again the next day", async () => {
    // 11:30 PM the day before, in Salem
    expect(await dailyLimitReached(database(requests(10, '2026-10-27T03:30:00Z')), 'user-a', NOW)).toBe(false);
  });

  it("is not reached by other users' requests", async () => {
    expect(await dailyLimitReached(database(requests(10, '2026-10-27T13:00:00Z', 'someone-else')), 'user-a', NOW)).toBe(false);
  });

  it('follows EXTRACTION_DAILY_LIMIT', async () => {
    vi.stubEnv('EXTRACTION_DAILY_LIMIT', '3');
    expect(await dailyLimitReached(database(requests(3, '2026-10-27T13:00:00Z')), 'user-a', NOW)).toBe(true);
  });

  it("is not reached when the count can't be read: the request itself is still checked", async () => {
    expect(await dailyLimitReached(database([], true), 'user-a', NOW)).toBe(false);
  });
});
