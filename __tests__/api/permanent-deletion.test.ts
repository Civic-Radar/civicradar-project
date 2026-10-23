// Tests for SRS-305.4, AO, Permanent deletion.
// "The system shall permanently delete the extraction when the user confirms deletion."
//
// Acceptance: Given the deletion confirmation is displayed, When the user confirms,
// Then the extraction no longer appears in the list and cannot be opened.
//
// Confirming calls DELETE /api/extractions/[id]. These tests then check the same
// list (GET /api/extractions?saved=1) and page data (GET /api/extractions/[id]) the
// Saved Extractions and extraction pages use.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_DENIED_MESSAGE } from '../../lib/extractions';

const USER_A = { id: 'user-a', email: 'a@example.com' };
const USER_B = { id: 'user-b', email: 'b@example.com' };
const TOKENS: Record<string, { id: string; email: string }> = { 'token-a': USER_A, 'token-b': USER_B };

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};

// In-memory tables. Deleting an extraction also deletes its officials, like the
// database's "on delete cascade" on extracted_officials.extraction_id.
function from(table: string) {
  let op: 'select' | 'delete' = 'select';
  const filters: [string, unknown][] = [];
  const matches = (row: Row) => filters.every(([c, v]) => row[c] === v);
  function run(): Row[] {
    const rows = tables[table] ?? [];
    const hit = rows.filter(matches);
    if (op === 'delete') {
      tables[table] = rows.filter((row) => !matches(row));
      if (table === 'extractions') {
        const gone = new Set(hit.map((r) => r.extraction_id));
        tables.extracted_officials = (tables.extracted_officials ?? []).filter((o) => !gone.has(o.extraction_id));
      }
    }
    return hit.map((r) => ({ ...r }));
  }
  const query = {
    select: () => query,
    delete: () => { op = 'delete'; return query; },
    eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
    order: async () => ({ data: run(), error: null }),
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve({ data: run(), error: null }).then(resolve, reject),
  };
  return query;
}

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (token: string) =>
        TOKENS[token] ? { data: { user: TOKENS[token] }, error: null } : { data: { user: null }, error: { message: 'Invalid token' } },
      ),
    },
    from,
  })),
}));

import { DELETE, GET as openExtraction } from '../../app/api/extractions/[id]/route';
import { GET as listExtractions } from '../../app/api/extractions/route';

const headers = (token: string) => ({ authorization: `Bearer ${token}` });
const confirmDelete = (id: string, token = 'token-a') =>
  DELETE(new Request(`http://localhost/api/extractions/${id}`, { method: 'DELETE', headers: headers(token) }), { params: { id } });
const open = (id: string, token = 'token-a') =>
  openExtraction(new Request(`http://localhost/api/extractions/${id}`, { headers: headers(token) }), { params: { id } });
const savedList = async (token = 'token-a') =>
  (await (await listExtractions(new Request('http://localhost/api/extractions?saved=1', { headers: headers(token) }))).json()).extractions as Row[];

function extraction(id: number, userId = USER_A.id): Row {
  return {
    extraction_id: id, user_id: userId, document_id: 19, source_document_title: 'Salem City Council Special Meeting October 15, 2026',
    status: 'Completed', failure_cause: null, requested_at: '2026-10-21T21:31:00Z', completed_at: '2026-10-21T21:31:30Z',
  };
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  tables = {
    extractions: [extraction(24), extraction(25), extraction(30, USER_B.id)],
    extracted_officials: [
      { extracted_official_id: 1, extraction_id: 24, full_name: 'Maureen Elizabeth Fisher' },
      { extracted_official_id: 2, extraction_id: 25, full_name: 'Merkl' },
    ],
  };
});

describe('Permanent deletion (SRS-305.4)', () => {
  it('deletes the extraction when the user confirms', async () => {
    const response = await confirmDelete('24');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
  });

  it('no longer lists the extraction', async () => {
    expect((await savedList()).map((e) => e.extraction_id)).toEqual([24, 25]);

    await confirmDelete('24');

    expect((await savedList()).map((e) => e.extraction_id)).toEqual([25]);
  });

  it('cannot open the extraction afterwards', async () => {
    await confirmDelete('24');

    expect((await open('24')).status).toBe(404);
  });

  it('deletes its officials with it', async () => {
    await confirmDelete('24');

    expect(tables.extracted_officials.map((o) => o.extraction_id)).toEqual([25]);
  });

  it("leaves the user's other extractions alone", async () => {
    await confirmDelete('24');

    expect((await open('25')).status).toBe(200);
  });

  it("does not delete another user's extraction (SRS-310.2)", async () => {
    const response = await confirmDelete('30');

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: ACCESS_DENIED_MESSAGE });
    expect(tables.extractions.some((e) => e.extraction_id === 30)).toBe(true);
  });

  it('answers 404 for an extraction that does not exist, and 401 without a sign-in', async () => {
    expect((await confirmDelete('999')).status).toBe(404);
    expect((await confirmDelete('24', 'bad-token')).status).toBe(401);
  });
});
