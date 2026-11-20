import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Card #726: the stored PDF is served on our own domain, by ticket, and no
// response names Supabase, the bucket, a storage path or a Storage token.

type Result = { data?: unknown; error: { message: string } | null };
type SignCall = { bucket: string; path: string; expiresIn: number };

// Database: documents.select resolves with the row or error a test sets.
const db = vi.hoisted(() => ({ result: { data: null, error: null } as Result, calls: 0 }));

// Storage: only the paths in `files` can be signed. Nothing reaches Storage.
const storage = vi.hoisted(() => ({ files: new Set<string>(), calls: [] as SignCall[] }));

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: vi.fn(() => {
      const builder: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'maybeSingle']) builder[method] = () => builder;
      builder.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) => {
        db.calls += 1;
        return Promise.resolve(db.result).then(resolve, reject);
      };
      return builder;
    }),
    storage: {
      from: vi.fn((bucket: string) => ({
        createSignedUrl: vi.fn(async (path: string, expiresIn: number) => {
          storage.calls.push({ bucket, path, expiresIn });
          return storage.files.has(path)
            ? { data: { signedUrl: `https://example.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=signed-token` }, error: null }
            : { data: null, error: { message: 'Object not found (storage 404)' } };
        }),
      })),
    },
  })),
}));

import { GET } from '../../app/api/documents/[id]/pdf/route';
import { createPdfTicket, isValidPdfTicket, PDF_LINK_SECONDS, storedPdfLink } from '../../lib/pdfLinkTicket';

const CONSOLE_METHODS = ['log', 'error', 'warn', 'info', 'debug'] as const;
const PDF_BYTES = '%PDF-1.4 stored minutes';
const ROW = { town_id: 1, source_file_id: '1168', storage_path: '1/1168.pdf', mime_type: 'application/pdf' };
const NOT_AVAILABLE = { error: 'The PDF is not available.' };
const LINK_REFUSED = { error: 'This PDF link is not valid or has expired. Reopen the document page.' };
// Words that must never reach the browser from this route.
const NEVER_SENT = ['supabase', 'storage/v1', 'documents/1/1168', '1/1168.pdf', 'signed-token', 'Object not found'];

let upstream: () => Promise<Response>;
let expectedErrorLogs = 0;

function request(id: string, ticket: string | null, headers: Record<string, string> = {}) {
  const query = ticket === null ? '' : `?ticket=${encodeURIComponent(ticket)}`;
  return GET(new Request(`http://localhost/api/documents/${id}/pdf${query}`, { headers }), { params: { id } });
}

function ticketFor(id: number, now = Date.now()): string {
  const ticket = createPdfTicket(id, now);
  if (!ticket) throw new Error('PDF_LINK_SECRET is not stubbed');
  return ticket;
}

async function expectNothingStorageRelated(response: Response) {
  const text = await response.clone().text();
  const headers = JSON.stringify(Array.from(response.headers.entries()));
  for (const word of NEVER_SENT) {
    expect(text).not.toContain(word);
    expect(headers).not.toContain(word);
  }
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  vi.stubEnv('PDF_LINK_SECRET', 'test-pdf-link-secret');
  db.result = { data: ROW, error: null };
  db.calls = 0;
  storage.files = new Set(['1/1168.pdf']);
  storage.calls.length = 0;
  upstream = async () =>
    new Response(PDF_BYTES, {
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(PDF_BYTES.length),
        'accept-ranges': 'bytes',
        server: 'supabase-storage',
        'x-sb-request-id': 'abc',
      },
    });
  vi.stubGlobal('fetch', vi.fn(async () => upstream()));
  for (const method of CONSOLE_METHODS) vi.spyOn(console, method).mockImplementation(() => {});
  expectedErrorLogs = 0;
});

afterEach(() => {
  for (const method of CONSOLE_METHODS) {
    expect(vi.mocked(console[method])).toHaveBeenCalledTimes(method === 'error' ? expectedErrorLogs : 0);
    vi.mocked(console[method]).mockRestore();
  }
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('PDF link tickets (lib/pdfLinkTicket)', () => {
  it('builds a link on our own domain that is valid for its document only', () => {
    const link = storedPdfLink(60);
    expect(link).toMatch(/^\/api\/documents\/60\/pdf\?ticket=\d+\.[A-Za-z0-9_-]{43}$/);
    const ticket = new URL(`http://localhost${link}`).searchParams.get('ticket');

    expect(isValidPdfTicket(60, ticket)).toBe(true);
    expect(isValidPdfTicket(61, ticket)).toBe(false);
  });

  it('lasts one hour', () => {
    const now = Date.parse('2026-11-20T12:00:00Z');
    const ticket = ticketFor(60, now);

    expect(ticket.split('.')[0]).toBe(String(now / 1000 + PDF_LINK_SECONDS));
    expect(isValidPdfTicket(60, ticket, now + (PDF_LINK_SECONDS - 1) * 1000)).toBe(true);
    expect(isValidPdfTicket(60, ticket, now + PDF_LINK_SECONDS * 1000)).toBe(false);
  });

  it('refuses a changed expiry, a changed signature, a malformed ticket and no ticket', () => {
    const [expiry, signature] = ticketFor(60).split('.');
    const otherSignature = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);

    expect(isValidPdfTicket(60, `${Number(expiry) + 3600}.${signature}`)).toBe(false);
    expect(isValidPdfTicket(60, `${expiry}.${otherSignature}`)).toBe(false);
    for (const bad of ['', 'abc', `${expiry}`, `${expiry}.`, `${expiry}.${signature}x`, `-1.${signature}`]) {
      expect(isValidPdfTicket(60, bad)).toBe(false);
    }
    expect(isValidPdfTicket(60, null)).toBe(false);
  });

  it('refuses a ticket made with another secret, and makes and accepts none without a secret', () => {
    const ticket = ticketFor(60);
    vi.stubEnv('PDF_LINK_SECRET', 'a-different-secret');
    expect(isValidPdfTicket(60, ticket)).toBe(false);

    vi.stubEnv('PDF_LINK_SECRET', '   ');
    expect(createPdfTicket(60)).toBeNull();
    expect(storedPdfLink(60)).toBeNull();
    expect(isValidPdfTicket(60, ticket)).toBe(false);
  });
});

describe('GET /api/documents/[id]/pdf (card #726)', () => {
  it('streams the stored PDF for a valid ticket, with no Storage detail in the response', async () => {
    const response = await request('60', ticketFor(60));

    expect(response.status).toBe(200);
    expect(await response.clone().text()).toBe(PDF_BYTES);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toBe('inline; filename="document-60.pdf"');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('content-length')).toBe(String(PDF_BYTES.length));
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(response.headers.has('server')).toBe(false);
    expect(response.headers.has('x-sb-request-id')).toBe(false);
    await expectNothingStorageRelated(response);

    // The server signs a short Storage link and fetches it itself.
    expect(storage.calls).toEqual([{ bucket: 'documents', path: '1/1168.pdf', expiresIn: 60 }]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      'https://example.supabase.co/storage/v1/object/sign/documents/1/1168.pdf?token=signed-token',
    );
  });

  it('passes a Range request through so the viewer can show page 1 early (SRS-NFR-6)', async () => {
    upstream = async () =>
      new Response('%PDF', {
        status: 206,
        headers: { 'content-range': `bytes 0-3/${PDF_BYTES.length}`, 'content-length': '4', 'accept-ranges': 'bytes' },
      });

    const response = await request('60', ticketFor(60), { Range: 'bytes=0-3' });

    expect(response.status).toBe(206);
    expect(await response.text()).toBe('%PDF');
    expect(response.headers.get('content-range')).toBe(`bytes 0-3/${PDF_BYTES.length}`);
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ headers: { Range: 'bytes=0-3' }, cache: 'no-store' });
  });

  it('answers 416 for a range past the end of the file', async () => {
    upstream = async () => new Response(null, { status: 416, headers: { 'content-range': `bytes */${PDF_BYTES.length}` } });

    const response = await request('60', ticketFor(60), { Range: 'bytes=999-' });

    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe(`bytes */${PDF_BYTES.length}`);
  });

  it('serves the file from the standard path when the recorded path has none (SRS-211.1, #514)', async () => {
    db.result = { data: { ...ROW, storage_path: 'civicclerk/salemma/1168.pdf' }, error: null };

    const response = await request('60', ticketFor(60));

    expect(response.status).toBe(200);
    expect(storage.calls.map((call) => call.path)).toEqual(['civicclerk/salemma/1168.pdf', '1/1168.pdf']);
  });

  it.each([
    ['no ticket', '60', null],
    ['an empty ticket', '60', ''],
    ['a malformed ticket', '60', 'not-a-ticket'],
  ])('refuses %s with 403 and reads nothing', async (_label, id, ticket) => {
    const response = await request(id, ticket);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual(LINK_REFUSED);
    expect(db.calls).toBe(0);
    expect(storage.calls).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses an expired ticket, a ticket for another document and a bad id with 403', async () => {
    const expired = ticketFor(60, Date.now() - (PDF_LINK_SECONDS + 1) * 1000);
    for (const [id, ticket] of [['60', expired], ['60', ticketFor(61)], ['abc', ticketFor(60)], ['60.0', ticketFor(60)]]) {
      const response = await request(id, ticket);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual(LINK_REFUSED);
    }
    expect(db.calls).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses every ticket when PDF_LINK_SECRET is not set', async () => {
    const ticket = ticketFor(60);
    vi.stubEnv('PDF_LINK_SECRET', '');

    const response = await request('60', ticket);

    expect(response.status).toBe(403);
    expect(db.calls).toBe(0);
  });

  it('answers 500 with no read when the service role key is not set', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    const response = await request('60', ticketFor(60));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(NOT_AVAILABLE);
    expect(db.calls).toBe(0);
  });

  it('answers 404 for an unknown document and 500 for a failed read, naming nothing', async () => {
    db.result = { data: null, error: null };
    const missing = await request('60', ticketFor(60));
    expect(missing.status).toBe(404);
    expect(await missing.clone().json()).toEqual(NOT_AVAILABLE);

    db.result = { data: null, error: { message: 'relation "documents" permission denied' } };
    const failed = await request('60', ticketFor(60));
    expect(failed.status).toBe(500);
    expect(await failed.clone().text()).not.toContain('permission denied');

    expect(storage.calls).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('answers 404 for a document with no stored PDF and does not call Storage for a non-PDF', async () => {
    db.result = { data: { ...ROW, mime_type: 'application/msword', storage_path: '1/1168.bin' }, error: null };

    const response = await request('60', ticketFor(60));

    expect(response.status).toBe(404);
    expect(storage.calls).toEqual([]);
  });

  it('answers 404 and logs by id only when no path can be signed', async () => {
    storage.files.clear();
    expectedErrorLogs = 1;

    const response = await request('60', ticketFor(60));

    expect(response.status).toBe(404);
    expect(await response.clone().json()).toEqual(NOT_AVAILABLE);
    await expectNothingStorageRelated(response);
    expect(console.error).toHaveBeenCalledWith('Stored PDF link could not be created for document 60.');
  });

  it.each([
    ['Storage cannot be reached', async () => { throw new Error('fetch failed: example.supabase.co unreachable'); }],
    ['Storage answers 500', async () => new Response('supabase storage error', { status: 500 })],
    ['Storage answers 400', async () => new Response('{"message":"Object not found"}', { status: 400 })],
  ])('answers 502 when %s, logging by id only', async (_label, answer) => {
    upstream = answer as () => Promise<Response>;
    expectedErrorLogs = 1;

    const response = await request('60', ticketFor(60));

    expect(response.status).toBe(502);
    expect(await response.clone().json()).toEqual(NOT_AVAILABLE);
    await expectNothingStorageRelated(response);
    expect(console.error).toHaveBeenCalledWith('Stored PDF could not be read for document 60.');
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('supabase');
  });
});
