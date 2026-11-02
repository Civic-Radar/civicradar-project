// Tests for SRS-301.7, AO, Daily extraction limit.
// "The system shall refuse a new extraction request, and display "You've reached
//  today's extraction limit. Please try again tomorrow.", when the signed-in user
//  has already requested the daily limit of extractions (10 by default) that day."
//
// Acceptance: Given a user has requested 10 extractions today, When the user requests
// another, Then no extraction request is created and the message is displayed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DAILY_LIMIT_MESSAGE } from '../../lib/extractions';
import { DEFAULT_DAILY_EXTRACTION_LIMIT, dailyExtractionLimit, startOfDay } from '../../lib/extraction/dailyLimit';

const USER = { id: 'user-a', email: 'a@example.com' };
type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
let nextId = 100;

// In-memory tables with the queries POST /api/extractions makes.
function from(table: string) {
  let op: 'select' | 'insert' | 'upsert' = 'select';
  let values: Row | null = null;
  let countOnly = false;
  const filters: ((row: Row) => boolean)[] = [];
  const run = () => {
    const rows = (tables[table] ??= []);
    if (op === 'insert') {
      const row = { extraction_id: nextId++, ...values };
      rows.push(row);
      return { data: row, error: null };
    }
    if (op === 'upsert') return { data: null, error: null };
    const hit = rows.filter((r) => filters.every((f) => f(r)));
    return countOnly ? { count: hit.length, data: null, error: null } : { data: hit[0] ?? null, error: null };
  };
  const query = {
    select: (_columns?: string, opts?: { count?: string; head?: boolean }) => { if (opts?.head) countOnly = true; return query; },
    insert: (v: Row) => { op = 'insert'; values = v; return query; },
    upsert: async () => ({ error: null }),
    eq: (column: string, value: unknown) => { filters.push((r) => r[column] === value); return query; },
    gte: (column: string, value: string) => { filters.push((r) => String(r[column]) >= value); return query; },
    maybeSingle: async () => run(),
    single: async () => run(),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  };
  return query;
}

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: USER }, error: null })) },
    from,
  })),
}));

import { POST } from '../../app/api/extractions/route';

const NOW = new Date('2026-10-27T18:00:00Z'); // 2:00 PM in Salem
const request = () =>
  POST(new Request('http://localhost/api/extractions', {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: JSON.stringify({ document_id: 13 }),
  }));

// `count` earlier extractions by the user, each for its own document and Completed.
function requestsAt(count: number, requestedAt: string, userId = USER.id): Row[] {
  return Array.from({ length: count }, (_, i) => ({
    extraction_id: i + 1, user_id: userId, document_id: 1000 + i, status: 'Completed', requested_at: requestedAt,
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.unstubAllEnvs();
  nextId = 100;
  tables = {
    documents: [{ document_id: 13, title: 'Joint Public Hearing with the Planning Board Monday October 19, 2026', mime_type: 'application/pdf' }],
    extractions: [],
    user_accounts: [],
  };
});
afterEach(() => vi.useRealTimers());

const created = () => tables.extractions.filter((e) => e.extraction_id as number >= 100);

describe('Daily extraction limit (SRS-301.7)', () => {
  it('refuses the request after 10 today: nothing is created and the message is returned', async () => {
    tables.extractions = requestsAt(10, '2026-10-27T13:00:00Z'); // 9:00 AM in Salem

    const response = await request();

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: DAILY_LIMIT_MESSAGE });
    expect(created()).toHaveLength(0);
  });

  it('uses the exact SRS wording', () => {
    expect(DAILY_LIMIT_MESSAGE).toBe("You've reached today's extraction limit. Please try again tomorrow.");
  });

  it('still allows the 10th request of the day', async () => {
    tables.extractions = requestsAt(9, '2026-10-27T13:00:00Z');

    const response = await request();

    expect(response.status).toBe(201);
    expect(created()).toHaveLength(1);
  });

  it("doesn't count yesterday's requests", async () => {
    tables.extractions = requestsAt(10, '2026-10-27T03:30:00Z'); // 11:30 PM the day before, in Salem

    expect((await request()).status).toBe(201);
  });

  it("doesn't count other users' requests", async () => {
    tables.extractions = requestsAt(10, '2026-10-27T13:00:00Z', 'someone-else');

    expect((await request()).status).toBe(201);
  });

  it('can be changed with EXTRACTION_DAILY_LIMIT', async () => {
    vi.stubEnv('EXTRACTION_DAILY_LIMIT', '3');
    tables.extractions = requestsAt(3, '2026-10-27T13:00:00Z');

    expect(dailyExtractionLimit()).toBe(3);
    expect((await request()).status).toBe(429);
  });

  it('defaults to 10 when EXTRACTION_DAILY_LIMIT is missing or not a positive whole number', () => {
    expect(dailyExtractionLimit()).toBe(DEFAULT_DAILY_EXTRACTION_LIMIT);
    vi.stubEnv('EXTRACTION_DAILY_LIMIT', 'lots');
    expect(dailyExtractionLimit()).toBe(10);
    vi.stubEnv('EXTRACTION_DAILY_LIMIT', '-5');
    expect(dailyExtractionLimit()).toBe(10);
  });

  it('starts the day at midnight in Salem, including on daylight saving days', () => {
    expect(startOfDay(new Date('2026-10-27T18:00:00Z')).toISOString()).toBe('2026-10-27T04:00:00.000Z'); // EDT
    expect(startOfDay(new Date('2026-12-15T18:00:00Z')).toISOString()).toBe('2026-12-15T05:00:00.000Z'); // EST
    expect(startOfDay(new Date('2026-11-01T18:00:00Z')).toISOString()).toBe('2026-11-01T04:00:00.000Z'); // clocks fall back that night
    expect(startOfDay(new Date('2026-10-27T02:00:00Z')).toISOString()).toBe('2026-10-26T04:00:00.000Z'); // 10 PM the evening before
  });
});
