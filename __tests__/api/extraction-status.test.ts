// Tests for GET /api/extractions/[id]:
//   SRS-306.1 (Extraction status display): returns the extraction's current status for its owner.
//   SRS-302.1 (Extracted official details): a completed extraction also returns each official's
//   name, title, role, email address, and telephone number.
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

// Fake tables. eq() calls are collected; maybeSingle() returns the first matching
// row and order() returns every matching row, like the real queries.
let rows: Row[] = [];
let officialRows: Row[] = [];
const eqCalls: [string, unknown][] = [];
const tablesRead: string[] = [];

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
      tablesRead.push(table);
      const source = () => (table === 'extracted_officials' ? officialRows : rows);
      const filters: [string, unknown][] = [];
      const matching = () => source().filter((row) => filters.every(([column, value]) => row[column] === value));
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => {
          filters.push([column, value]);
          eqCalls.push([column, value]);
          return query;
        }),
        maybeSingle: vi.fn(async () => ({ data: matching()[0] ?? null, error: null })),
        order: vi.fn(async () => ({ data: matching(), error: null })),
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
    officialRows = [];
    eqCalls.length = 0;
    tablesRead.length = 0;
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

  it('looks up the extraction by its id', async () => {
    rows = [extractionRow()];

    await get('7');

    expect(eqCalls).toContainEqual(['extraction_id', 7]);
  });

  it("denies someone else's extraction (SRS-310.2)", async () => {
    rows = [extractionRow({ user_id: 'someone-else' })];

    const response = await get('7');

    expect(response.status).toBe(403);
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

function officialRow(overrides: Row = {}): Row {
  return {
    extracted_official_id: 1,
    extraction_id: 7,
    full_name: 'Maureen Elizabeth Fisher',
    title: 'City Clerk',
    role: 'Attests the record',
    email: 'clerk@salem.com',
    phone: '978-555-0100',
    ...overrides,
  };
}

describe('GET /api/extractions/[id] officials (SRS-302.1)', () => {
  beforeEach(() => {
    rows = [];
    officialRows = [];
    eqCalls.length = 0;
    tablesRead.length = 0;
  });

  it('returns all five values for an official found by a completed extraction', async () => {
    rows = [extractionRow({ status: 'Completed', completed_at: '2026-10-13T14:49:00Z' })];
    officialRows = [officialRow()];

    const body = await (await get('7')).json();

    expect(body.officials).toHaveLength(1);
    expect(body.officials[0]).toMatchObject({
      full_name: 'Maureen Elizabeth Fisher',
      title: 'City Clerk',
      role: 'Attests the record',
      email: 'clerk@salem.com',
      phone: '978-555-0100',
    });
  });

  it('returns each official as a separate entry', async () => {
    rows = [extractionRow({ status: 'Completed', completed_at: '2026-10-13T14:49:00Z' })];
    officialRows = [
      officialRow(),
      officialRow({ extracted_official_id: 2, full_name: 'Jonathan Berk', title: null, role: 'Planning Board Chair', email: null, phone: null }),
      officialRow({ extracted_official_id: 3, full_name: 'Alice Merkl', title: 'City Councillor', role: 'Presiding', email: null, phone: null }),
    ];

    const body = await (await get('7')).json();

    expect(body.officials).toHaveLength(3);
    expect(body.officials[1]).toMatchObject({ full_name: 'Jonathan Berk', email: null, phone: null });
  });

  it("only returns this extraction's officials", async () => {
    rows = [extractionRow({ status: 'Completed', completed_at: '2026-10-13T14:49:00Z' })];
    officialRows = [officialRow(), officialRow({ extracted_official_id: 2, extraction_id: 99, full_name: 'Someone Else' })];

    const body = await (await get('7')).json();

    expect(body.officials).toHaveLength(1);
    expect(eqCalls).toContainEqual(['extraction_id', 7]);
  });

  it('does not load officials before the extraction is Completed', async () => {
    rows = [extractionRow({ status: 'Processing' })];
    officialRows = [officialRow()];

    const body = await (await get('7')).json();

    expect(body.officials).toEqual([]);
    expect(tablesRead).not.toContain('extracted_officials');
  });
});
