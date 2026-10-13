// Tests for SRS-306.1 (Extraction status display):
// GET /api/extractions/[id] returns the extraction's current status for its owner.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXTRACTION_STATUSES } from '../../lib/extractions';

const OWNER = { id: 'user-123', email: 'ao@example.com' };

type Row = Record<string, unknown>;

function extractionRow(overrides: Row = {}): Row {
  return {
    extraction_id: 7,
    user_id: OWNER.id,
    document_id: 10,
    source_document_title: 'City Council Regular Meeting - Agenda',
    status: 'Queued',
    failure_cause: null,
    requested_at: '2026-10-13T14:48:00Z',
    completed_at: null,
    ...overrides,
  };
}

// Fake extractions table. eq() calls are collected and maybeSingle() returns
// the first row that matches every one of them, like the real query.
let rows: Row[] = [];
const eqCalls: [string, unknown][] = [];

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (token: string) =>
        token === 'valid-token'
          ? { data: { user: OWNER }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
      ),
    },
    from: vi.fn((table: string) => {
      expect(table).toBe('extractions');
      const filters: [string, unknown][] = [];
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          filters.push([column, value]);
          eqCalls.push([column, value]);
          return query;
        }),
        maybeSingle: vi.fn(async () => ({
          data: rows.find((row) => filters.every(([column, value]) => row[column] === value)) ?? null,
          error: null,
        })),
      };
      return query;
    }),
  })),
}));

import { GET } from '../../app/api/extractions/[id]/route';

function get(id: string, token: string | null = 'valid-token') {
  const request = new Request(`http://localhost/api/extractions/${id}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return GET(request, { params: { id } });
}

describe('GET /api/extractions/[id] (SRS-306.1)', () => {
  beforeEach(() => {
    rows = [];
    eqCalls.length = 0;
  });

  it('has exactly the four statuses the SRS names', () => {
    expect(EXTRACTION_STATUSES).toEqual(['Queued', 'Processing', 'Completed', 'Failed']);
  });

  for (const status of EXTRACTION_STATUSES) {
    it(`returns the current status when it is ${status}`, async () => {
      rows = [extractionRow({ status })];

      const response = await get('7');

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.extraction.status).toBe(status);
      expect(body.extraction.source_document_title).toBe('City Council Regular Meeting - Agenda');
    });
  }

  it('returns the new status after it changes (Processing -> Completed)', async () => {
    rows = [extractionRow({ status: 'Processing' })];
    expect((await (await get('7')).json()).extraction.status).toBe('Processing');

    rows = [extractionRow({ status: 'Completed', completed_at: '2026-10-13T14:49:00Z' })];
    expect((await (await get('7')).json()).extraction.status).toBe('Completed');
  });

  it("only looks up the signed-in user's own extraction", async () => {
    rows = [extractionRow()];

    await get('7');

    expect(eqCalls).toContainEqual(['extraction_id', 7]);
    expect(eqCalls).toContainEqual(['user_id', OWNER.id]);
  });

  it("returns 404 for someone else's extraction", async () => {
    rows = [extractionRow({ user_id: 'someone-else' })];

    const response = await get('7');

    expect(response.status).toBe(404);
  });

  it('returns 404 when the extraction does not exist', async () => {
    const response = await get('999');
    expect(response.status).toBe(404);
  });

  it('returns 400 for an id that is not a number', async () => {
    const response = await get('abc');
    expect(response.status).toBe(400);
  });

  it('returns 401 without a token', async () => {
    const response = await get('7', null);
    expect(response.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await get('7', 'bad-token');
    expect(response.status).toBe(401);
  });
});
