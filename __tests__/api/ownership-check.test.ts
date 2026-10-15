// Tests for SRS-310.2, AO, Ownership check.
// "The system shall deny a request to view, search, or delete an extraction when
//  the signed-in user does not own that extraction."
//
// Acceptance: Given user A owns extraction 42, When user B requests extraction 42
// by changing the page address, Then the system returns an access-denied response.
//
// Covers the two extraction requests that exist today: view (GET) and run (POST).
// Search (SRS-309) and delete (SRS-305) aren't built yet.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_DENIED_MESSAGE } from '../../lib/extractions';

const USER_A = { id: 'user-a', email: 'a@example.com' };
const USER_B = { id: 'user-b', email: 'b@example.com' };
const TOKENS: Record<string, { id: string; email: string }> = { 'token-a': USER_A, 'token-b': USER_B };

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};
const tablesRead: string[] = [];

// In-memory stand-in for the Supabase tables the two routes use.
function from(table: string) {
  tablesRead.push(table);
  let op: 'select' | 'update' | 'insert' | 'delete' = 'select';
  let values: Row | Row[] | null = null;
  const filters: [string, unknown][] = [];
  const matches = (row: Row) => filters.every(([column, value]) => row[column] === value);

  function run(): Row[] {
    const rows = (tables[table] ??= []);
    if (op === 'insert') {
      const added = (Array.isArray(values) ? values : [values as Row]).map((row, i) => ({
        extracted_official_id: rows.length + i + 1,
        ...row,
      }));
      rows.push(...added);
      return added;
    }
    const hit = rows.filter(matches);
    if (op === 'update') hit.forEach((row) => Object.assign(row, values));
    if (op === 'delete') tables[table] = rows.filter((row) => !matches(row));
    return hit.map((row) => ({ ...row }));
  }

  const query = {
    select: () => query,
    update: (v: Row) => { op = 'update'; values = v; return query; },
    insert: (v: Row[]) => { op = 'insert'; values = v; return query; },
    delete: () => { op = 'delete'; return query; },
    eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
    order: () => query,
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
        TOKENS[token]
          ? { data: { user: TOKENS[token] }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
      ),
    },
    from,
  })),
}));

// Nothing leaves the machine: CivicClerk and the Claude API are stubbed.
const fetchDocumentText = vi.fn(async () => 'Attest: Maureen Elizabeth Fisher, City Clerk');
vi.mock('../../lib/sources/civicclerkFiles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/sources/civicclerkFiles')>()),
  fetchDocumentText: (...args: unknown[]) => fetchDocumentText(...(args as [])),
}));
vi.mock('../../lib/extraction/findOfficials', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/extraction/findOfficials')>()),
  findOfficials: vi.fn(async () => [
    { full_name: 'Maureen Elizabeth Fisher', title: 'City Clerk', role: null, email: 'mfisher@salem.com', phone: '978-745-9595' },
  ]),
}));

import { GET } from '../../app/api/extractions/[id]/route';
import { POST } from '../../app/api/extractions/[id]/run/route';

function view(id: string, token: string) {
  const request = new Request(`http://localhost/api/extractions/${id}`, { headers: { authorization: `Bearer ${token}` } });
  return GET(request, { params: { id } });
}

function runIt(id: string, token: string) {
  const request = new Request(`http://localhost/api/extractions/${id}/run`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
  return POST(request, { params: { id } });
}

// User A owns extraction 42.
function seed(status: string, officials: Row[] = []) {
  tables = {
    extractions: [{
      extraction_id: 42, user_id: USER_A.id, document_id: 1,
      source_document_title: 'City Council Regular Meeting October 8, 2026',
      status, failure_cause: null, requested_at: '2026-10-15T14:00:00Z',
      completed_at: status === 'Completed' ? '2026-10-15T14:01:00Z' : null,
    }],
    documents: [{ document_id: 1, town_id: 1, source_file_id: '1170', file_size_bytes: 1000 }],
    towns: [{ town_id: 1, source_account_id: 'salemma' }],
    extracted_officials: officials,
  };
}

const FISHER = {
  extracted_official_id: 1, extraction_id: 42, full_name: 'Maureen Elizabeth Fisher',
  title: 'Acting City Clerk', role: null, email: 'mfisher@salem.com', phone: '978-745-9595 ext. 41200',
};

beforeEach(() => {
  tablesRead.length = 0;
  fetchDocumentText.mockClear();
});

describe('Viewing an extraction (SRS-310.2)', () => {
  it("returns access denied when user B requests user A's extraction 42", async () => {
    seed('Completed', [FISHER]);

    const response = await view('42', 'token-b');

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: ACCESS_DENIED_MESSAGE });
  });

  it("does not read user A's officials for user B", async () => {
    seed('Completed', [FISHER]);

    await view('42', 'token-b');

    expect(tablesRead).not.toContain('extracted_officials');
  });

  it('still shows user A their own extraction 42', async () => {
    seed('Completed', [FISHER]);

    const response = await view('42', 'token-a');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.extraction.extraction_id).toBe(42);
    expect(body.officials).toHaveLength(1);
  });

  it('returns 404, not access denied, for an extraction that does not exist', async () => {
    seed('Completed');

    const response = await view('999', 'token-b');

    expect(response.status).toBe(404);
  });
});

describe('Running an extraction (SRS-310.2)', () => {
  it("returns access denied when user B tries to run user A's extraction 42", async () => {
    seed('Queued');

    const response = await runIt('42', 'token-b');

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: ACCESS_DENIED_MESSAGE });
  });

  it("leaves user A's extraction untouched and reads no document", async () => {
    seed('Queued');

    await runIt('42', 'token-b');

    expect(tables.extractions[0].status).toBe('Queued');
    expect(tables.extracted_officials).toHaveLength(0);
    expect(fetchDocumentText).not.toHaveBeenCalled();
  });

  it('still lets user A run their own extraction 42', async () => {
    seed('Queued');

    const response = await runIt('42', 'token-a');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'Completed', officialsFound: 1 });
  });

  it('returns 404, not access denied, for an extraction that does not exist', async () => {
    seed('Queued');

    const response = await runIt('999', 'token-b');

    expect(response.status).toBe(404);
  });
});
