// Tests for SRS-304.1, AO, Saved extraction list.
// "The system shall list the signed-in user's saved extractions, with each one's
//  source document title and extraction date, when the user opens the Saved
//  Extractions page."
//
// Acceptance: Given the user has two saved extractions, When the user opens the
// Saved Extractions page, Then both are listed, each with its source document
// title and extraction date.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractionDate } from '../../lib/extractions';

const USER = { id: 'user-a', email: 'a@example.com' };
type Row = Record<string, unknown>;

let rows: Row[] = [];
let orderedBy: [string, unknown] | null = null;

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (token: string) =>
        token === 'valid-token'
          ? { data: { user: USER }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
      ),
    },
    from: vi.fn(() => {
      const filters: [string, unknown][] = [];
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => { filters.push([column, value]); return query; }),
        order: vi.fn(async (column: string, opts: { ascending: boolean }) => {
          orderedBy = [column, opts.ascending];
          const hit = rows.filter((r) => filters.every(([c, v]) => r[c] === v));
          hit.sort((a, b) => String(b[column]).localeCompare(String(a[column])));
          return { data: hit, error: null };
        }),
      };
      return query;
    }),
  })),
}));

import { GET } from '../../app/api/extractions/route';

function listSaved(token = 'valid-token') {
  return GET(new Request('http://localhost/api/extractions?saved=1', { headers: { authorization: `Bearer ${token}` } }));
}

function extraction(id: number, overrides: Row = {}): Row {
  return {
    extraction_id: id, user_id: USER.id, document_id: id, source_document_title: `Document ${id}`,
    status: 'Completed', requested_at: '2026-09-20T18:04:00Z', completed_at: '2026-09-20T18:05:00Z', ...overrides,
  };
}

beforeEach(() => {
  rows = [];
  orderedBy = null;
});

describe('Saved extraction list (SRS-304.1)', () => {
  it('lists both of the user\'s two saved extractions, each with its source document title and extraction date', async () => {
    rows = [
      extraction(24, { source_document_title: 'Salem City Council Special Meeting October 15, 2026', completed_at: '2026-10-21T21:31:30Z' }),
      extraction(25, { source_document_title: 'Joint Public Hearing with the Planning Board Monday October 19, 2026', completed_at: '2026-10-21T21:32:30Z' }),
    ];

    const response = await listSaved();
    const { extractions } = await response.json();

    expect(response.status).toBe(200);
    expect(extractions).toHaveLength(2);
    for (const e of extractions) {
      expect(e.source_document_title).toBeTruthy();
      expect(extractionDate(e)).toBe(e.completed_at);
    }
  });

  it('lists the newest extraction first', async () => {
    rows = [extraction(24, { completed_at: '2026-10-21T21:31:30Z' }), extraction(25, { completed_at: '2026-10-21T21:32:30Z' })];

    const { extractions } = await (await listSaved()).json();

    expect(orderedBy).toEqual(['completed_at', false]);
    expect(extractions.map((e: Row) => e.extraction_id)).toEqual([25, 24]);
  });

  it('lists only completed extractions, the ones with saved results', async () => {
    rows = [
      extraction(24),
      extraction(26, { status: 'Failed', completed_at: '2026-10-22T05:42:37Z' }),
      extraction(27, { status: 'Processing', completed_at: null }),
    ];

    const { extractions } = await (await listSaved()).json();

    expect(extractions.map((e: Row) => e.extraction_id)).toEqual([24]);
  });

  it("lists only the signed-in user's own extractions", async () => {
    rows = [extraction(24), extraction(30, { user_id: 'someone-else' })];

    const { extractions } = await (await listSaved()).json();

    expect(extractions.map((e: Row) => e.extraction_id)).toEqual([24]);
  });

  it('requires a signed-in user', async () => {
    expect((await listSaved('bad-token')).status).toBe(401);
  });

  it('uses the finish time as the extraction date', () => {
    expect(extractionDate({ requested_at: '2026-09-20T18:04:00Z', completed_at: '2026-09-20T18:05:00Z' })).toBe('2026-09-20T18:05:00Z');
    expect(extractionDate({ requested_at: '2026-09-20T18:04:00Z', completed_at: null })).toBe('2026-09-20T18:04:00Z');
  });
});
