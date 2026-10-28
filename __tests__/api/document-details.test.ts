import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error: { message: string } | null };
type Call = { table: string; method: string; args: unknown[] };

// Each from(table) call returns a chain that records its calls and resolves
// with the result registered for "<table>.<first method>", e.g. "documents.select".
// The chain has no write methods, so any write would throw.
const db = vi.hoisted(() => ({
  results: {} as Record<string, Result>,
  calls: [] as Call[],
}));

vi.mock('../../lib/supabase', () => {
  function chain(table: string) {
    let operation = '';
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'maybeSingle']) {
      builder[method] = (...args: unknown[]) => {
        if (!operation) operation = method;
        db.calls.push({ table, method, args });
        return builder;
      };
    }
    builder.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(db.results[`${table}.${operation}`] ?? { data: null, error: null }).then(resolve, reject);
    return builder;
  }

  return {
    getSupabaseClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn(async (token: string) => {
          if (token === 'valid-token') {
            return { data: { user: { id: 'user-123', email: 'resident@example.com' } }, error: null };
          }
          return { data: { user: null }, error: { message: 'Invalid token' } };
        }),
      },
      from: vi.fn((table: string) => chain(table)),
    })),
  };
});

import { GET } from '../../app/api/documents/[id]/route';
import { getSupabaseClient } from '../../lib/supabase';

const SELECTED_COLUMNS =
  'document_id, meeting_id, town_id, title, document_type, source_url, retrieved_at, summary_status, summary_text, summary_generated_at, storage_path, mime_type';
const LOAD_ERROR = 'This document could not be loaded. Please try again.';
const dbError = { message: 'relation "documents" does not exist (42P01)' };

const DOCUMENT = {
  document_id: 7,
  meeting_id: 42,
  town_id: 1,
  title: 'City Council Agenda Packet',
  document_type: 'Packet',
  source_url: 'https://example.org/files/7.pdf',
  retrieved_at: '2026-10-01T12:00:00+00:00',
};
const PENDING_ROW = { ...DOCUMENT, summary_status: 'Pending', summary_text: null, summary_generated_at: null };
// The row has no storage_path or mime_type, so no PDF link is made (SRS-203.2).
const PENDING_RESPONSE = { ...DOCUMENT, summary_text: null, summary_generated_at: null, pdf_url: null };

function open(id: string, token: string | null = 'valid-token', headers?: Record<string, string>) {
  const request = new Request(`http://localhost/api/documents/${id}`, {
    headers: headers ?? (token ? { authorization: `Bearer ${token}` } : {}),
  });
  return GET(request, { params: { id } });
}

function callsTo(table: string, method: string) {
  return db.calls.filter((call) => call.table === table && call.method === method);
}

function getUserMock() {
  const client = vi.mocked(getSupabaseClient).mock.results[0]?.value;
  return client?.auth.getUser;
}

function notFound() {
  db.results['documents.select'] = { data: null, error: null };
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  vi.mocked(getSupabaseClient).mockClear();
  db.calls.length = 0;
  db.results = {
    'documents.select': { data: PENDING_ROW, error: null },
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/documents/[id] (SRS-203.1)', () => {
  it('returns the document identification for a signed-in resident', async () => {
    const response = await open('7');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ document: PENDING_RESPONSE });
    expect(Object.keys(body)).toEqual(['document']);
    expect(Object.keys(body.document).sort()).toEqual([
      'document_id',
      'document_type',
      'meeting_id',
      'pdf_url',
      'retrieved_at',
      'source_url',
      'summary_generated_at',
      'summary_text',
      'title',
      'town_id',
    ]);
    expect(getUserMock()).toHaveBeenCalledWith('valid-token');
  });

  it('reads only the identification columns of one document by numeric id', async () => {
    await open('7');

    // summary_status, storage_path and mime_type are read but not returned.
    expect(callsTo('documents', 'select')).toEqual([
      { table: 'documents', method: 'select', args: [SELECTED_COLUMNS] },
    ]);
    const eqCalls = callsTo('documents', 'eq');
    expect(eqCalls).toEqual([{ table: 'documents', method: 'eq', args: ['document_id', 7] }]);
    expect(typeof eqCalls[0].args[1]).toBe('number');
    expect(db.calls.map((call) => call.method)).toEqual(['select', 'eq', 'maybeSingle']);
    expect(new Set(db.calls.map((call) => call.table))).toEqual(new Set(['documents']));
  });

  it('reads document 7 for the id "007"', async () => {
    const response = await open('007');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ document: PENDING_RESPONSE });
    expect(callsTo('documents', 'eq')[0].args).toEqual(['document_id', 7]);
  });

  it.each([
    ['0', 0],
    ['42', 42],
    ['9007199254740991', 9007199254740991],
  ])('returns 404 when no document has the id "%s"', async (id, expected) => {
    notFound();

    const response = await open(id);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Document not found.' });
    expect(callsTo('documents', 'eq')[0].args).toEqual(['document_id', expected]);
  });

  it.each([
    'abc',
    '-1',
    '1.5',
    '1e3',
    '+7',
    ' 7',
    '7 ',
    '0x1A',
    '12abc',
    '',
    '9007199254740992',
  ])('returns 400 and reads nothing for the id "%s"', async (id) => {
    const response = await open(id);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid document id.' });
    expect(getUserMock()).toHaveBeenCalledWith('valid-token');
    expect(db.calls).toEqual([]);
  });

  it('returns 401 without a token', async () => {
    const response = await open('7', null);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(getSupabaseClient).not.toHaveBeenCalled();
    expect(db.calls).toEqual([]);
  });

  it('returns 401 for an Authorization header that is not Bearer', async () => {
    const response = await open('7', null, { authorization: 'Basic dXNlcjpwYXNz' });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(getSupabaseClient).not.toHaveBeenCalled();
    expect(db.calls).toEqual([]);
  });

  it('returns 401 for an invalid token', async () => {
    const response = await open('7', 'bad-token');

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid or expired token.' });
    expect(db.calls).toEqual([]);
  });

  it('reports a configuration error and makes no database call without the service-role key', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    const response = await open('7');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Supabase credentials are not configured.' });
    expect(getSupabaseClient).not.toHaveBeenCalled();
    expect(db.calls).toEqual([]);
  });

  it('returns 500 when Supabase is not configured', async () => {
    vi.mocked(getSupabaseClient).mockReturnValueOnce(null);

    const response = await open('7');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Supabase credentials are not configured.' });
    expect(db.calls).toEqual([]);
  });

  it('returns a fixed message, not the database error, when the read fails', async () => {
    db.results['documents.select'] = { data: null, error: dbError };

    const response = await open('7');
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: LOAD_ERROR });
    expect(text).not.toContain(dbError.message);
    expect(text).not.toContain('42P01');
    expect(callsTo('documents', 'maybeSingle')).toHaveLength(1);
  });
});

describe('sign-in is checked before the id', () => {
  it('rejects the bad id "abc" with 400 when signed in', async () => {
    const response = await open('abc');
    expect(response.status).toBe(400);
  });

  it('returns 401 Unauthorized for "abc" without a token', async () => {
    const response = await open('abc', null);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(getSupabaseClient).not.toHaveBeenCalled();
    expect(db.calls).toEqual([]);
  });

  it('returns 401 for "abc" with an invalid token', async () => {
    const response = await open('abc', 'bad-token');

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Invalid or expired token.' });
    expect(db.calls).toEqual([]);
  });

  it('returns the configuration error for "abc" without the service-role key', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    const response = await open('abc');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Supabase credentials are not configured.' });
    expect(db.calls).toEqual([]);
  });
});
