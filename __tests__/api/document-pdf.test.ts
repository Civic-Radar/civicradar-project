import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentIdentification, DocumentState } from '../../app/(app)/documents/[id]/useDocument';

// @types/react-dom is not installed, so react-dom/server is loaded with only the
// one function this file uses typed here.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

type Result = { data?: unknown; error: { message: string } | null };
type Call = { table: string; method: string; args: unknown[] };
type SignCall = { bucket: string; path: string; expiresIn: number };

// API half: each from(table) call returns a chain that records its calls and
// resolves with the result registered for "<table>.<first method>". The chain
// has no write methods, so any write would throw.
const db = vi.hoisted(() => ({
  results: {} as Record<string, Result>,
  calls: [] as Call[],
}));

// Storage half: createSignedUrl records its arguments and answers with the
// result a test sets, or throws when `throws` is set. Nothing reaches Storage.
const storage = vi.hoisted(() => ({
  result: { data: null, error: null } as Result,
  throws: false,
  calls: [] as SignCall[],
}));

// Page half: the page gets its data only through useDocument, so the hook is
// replaced by whatever state a test sets. No fetch, no localStorage, no effects.
const hook = vi.hoisted(() => ({ state: { status: 'loading' } as DocumentState }));

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
      storage: {
        from: vi.fn((bucket: string) => ({
          createSignedUrl: vi.fn(async (path: string, expiresIn: number) => {
            storage.calls.push({ bucket, path, expiresIn });
            if (storage.throws) throw new Error('fetch failed: storage unreachable');
            return storage.result;
          }),
        })),
      },
    })),
  };
});

vi.mock('../../app/(app)/documents/[id]/useDocument', () => ({
  useDocument: () => hook.state,
}));

import { GET } from '../../app/api/documents/[id]/route';
import DocumentDetailPage from '../../app/(app)/documents/[id]/page';

const CONSOLE_METHODS = ['log', 'error', 'warn', 'info', 'debug'] as const;

const SIGNED_URL = 'https://example.supabase.co/storage/v1/object/sign/documents/1/1168.pdf?token=signed-token';
const STORAGE_ERROR = { message: 'Object not found (storage 404)' };
const SIGN_FAILED_LOG = 'Stored PDF link could not be created for document 60.';
const NOT_AVAILABLE = 'The PDF is not available.';

const IDENTIFICATION = {
  document_id: 60,
  meeting_id: 42,
  town_id: 1,
  title: 'City Council Agenda Packet',
  document_type: 'Packet',
  source_url: 'https://example.org/files/60.pdf',
  retrieved_at: '2026-10-01T12:00:00+00:00',
};

const STORED_PDF_ROW = {
  ...IDENTIFICATION,
  storage_path: '1/1168.pdf',
  mime_type: 'application/pdf',
  summary_status: 'Pending',
  summary_text: null,
  summary_generated_at: null,
};

// Number of console.error calls a test expects (a failed signing logs one).
let expectedErrorLogs = 0;

function open(id = '60') {
  const request = new Request(`http://localhost/api/documents/${id}`, {
    headers: { authorization: 'Bearer valid-token' },
  });
  return GET(request, { params: { id } });
}

function storedRow(row: Record<string, unknown> | null) {
  db.results['documents.select'] = { data: row, error: null };
}

function loadedDocument(pdf_url: string | null, summary_text: string | null = null): DocumentIdentification {
  return {
    ...IDENTIFICATION,
    summary_text,
    summary_generated_at: summary_text === null ? null : '2026-10-02T08:30:00+00:00',
    pdf_url,
  };
}

// Vitest compiles this project's JSX to React.createElement, and the page does
// not import React, so React is stubbed as a global for the render.
function renderLoaded(document: DocumentIdentification): string {
  hook.state = { status: 'loaded', document };
  return renderToStaticMarkup(React.createElement(DocumentDetailPage, { params: { id: '60' } }));
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');
}

function attributesOf(attrs: string): Record<string, string> {
  return Object.fromEntries(
    Array.from(attrs.matchAll(/([^\s=]+)="([^"]*)"/g), ([, name, value]) => [name, unescapeHtml(value)]),
  );
}

function iframesIn(markup: string): Record<string, string>[] {
  return Array.from(markup.matchAll(/<iframe\b([^>]*)>/g), ([, attrs]) => attributesOf(attrs));
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('Network is disabled in tests');
    }),
  );
  for (const method of CONSOLE_METHODS) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
  db.calls.length = 0;
  db.results = {};
  storage.calls.length = 0;
  storage.result = { data: { signedUrl: SIGNED_URL }, error: null };
  storage.throws = false;
  expectedErrorLogs = 0;
});

afterEach(() => {
  // Nothing reaches the network, and nothing is logged except an expected
  // failed-signing line, not even a React warning.
  expect(fetch).not.toHaveBeenCalled();
  for (const method of CONSOLE_METHODS) {
    expect(vi.mocked(console[method])).toHaveBeenCalledTimes(method === 'error' ? expectedErrorLogs : 0);
    vi.mocked(console[method]).mockRestore();
  }
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  hook.state = { status: 'loading' };
});

describe('GET /api/documents/[id] PDF link (SRS-203.2)', () => {
  it('returns the signed Storage link for a stored PDF, valid for 600 seconds', async () => {
    storedRow(STORED_PDF_ROW);

    const response = await open();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      document: { ...IDENTIFICATION, summary_text: null, summary_generated_at: null, pdf_url: SIGNED_URL },
    });
    expect(storage.calls).toEqual([{ bucket: 'documents', path: '1/1168.pdf', expiresIn: 600 }]);
    // The link is the Storage copy, never the source's own address.
    expect(body.document.pdf_url).not.toBe(IDENTIFICATION.source_url);
  });

  it.each([
    ['a file that is not a PDF', { storage_path: '1/1168.bin', mime_type: 'application/octet-stream' }],
    ['a document with no storage_path', { storage_path: null, mime_type: 'application/pdf' }],
    ['a document with an empty storage_path', { storage_path: '', mime_type: 'application/pdf' }],
  ])('returns pdf_url null and asks Storage nothing for %s', async (_label, fields) => {
    storedRow({ ...STORED_PDF_ROW, ...fields });

    const response = await open();
    const text = await response.text();
    const body = JSON.parse(text);

    expect(response.status).toBe(200);
    expect(body.document).toHaveProperty('pdf_url', null);
    expect(text).toContain('"pdf_url":null');
    expect(storage.calls).toEqual([]);
  });

  it('returns pdf_url null and still answers 200 when Storage refuses to sign', async () => {
    storedRow(STORED_PDF_ROW);
    storage.result = { data: null, error: STORAGE_ERROR };
    expectedErrorLogs = 1;

    const response = await open();
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      document: { ...IDENTIFICATION, summary_text: null, summary_generated_at: null, pdf_url: null },
    });
    expect(text).not.toContain(STORAGE_ERROR.message);
    expect(storage.calls).toHaveLength(1);
    // Logged by document id only, never with the Storage message.
    expect(console.error).toHaveBeenCalledWith(SIGN_FAILED_LOG);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(STORAGE_ERROR.message);
  });

  it('returns pdf_url null and still answers 200 when the signing call throws', async () => {
    storedRow(STORED_PDF_ROW);
    storage.throws = true;
    expectedErrorLogs = 1;

    const response = await open();
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text).document).toHaveProperty('pdf_url', null);
    expect(text).not.toContain('storage unreachable');
    expect(console.error).toHaveBeenCalledWith(SIGN_FAILED_LOG);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('storage unreachable');
  });

  it('still returns the same 404 for an unknown document, with no Storage call', async () => {
    storedRow(null);

    const response = await open('42');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Document not found.' });
    expect(storage.calls).toEqual([]);
  });
});

describe('Document detail page in-page PDF (SRS-203.2)', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React);
  });

  it('shows page 1 of the PDF in an iframe titled "Document PDF"', () => {
    const markup = renderLoaded(loadedDocument(SIGNED_URL));

    const iframes = iframesIn(markup);
    expect(iframes).toHaveLength(1);
    expect(iframes[0].title).toBe('Document PDF');
    expect(iframes[0].src).toBe(`${SIGNED_URL}#page=1`);
    expect(iframes[0].src.endsWith('#page=1')).toBe(true);
    expect(markup).not.toContain(NOT_AVAILABLE);
  });

  it('opens no new tab: no target attribute and no link but View source PDF', () => {
    const markup = renderLoaded(loadedDocument(SIGNED_URL, 'First paragraph.'));

    expect(iframesIn(markup)[0]).not.toHaveProperty('target');
    expect(markup).not.toContain('target=');
    expect(markup).not.toContain('_blank');
    // The only link is the summary's View source PDF link (SRS-207.1).
    expect(markup.match(/<a\b[^>]*>[\s\S]*?<\/a>/g)).toEqual([
      `<a href="${SIGNED_URL}" class="text-accent hover:underline">View source PDF</a>`,
    ]);
  });

  it('places the viewer after the title and directly after the summary section', () => {
    const markup = renderLoaded(loadedDocument(SIGNED_URL, 'First paragraph.'));

    expect(markup.indexOf('</h1>')).toBeGreaterThan(-1);
    expect(markup.indexOf('</h1>')).toBeLessThan(markup.indexOf('<iframe'));
    expect(markup).toMatch(/<\/section><iframe\b/);
  });

  it('shows "The PDF is not available." in place of the viewer when pdf_url is null', () => {
    const markup = renderLoaded(loadedDocument(null, 'First paragraph.'));

    expect(iframesIn(markup)).toEqual([]);
    expect(markup).toMatch(new RegExp(`<\\/section><p class="text-fg-muted">${NOT_AVAILABLE.replace(/\./g, '\\.')}<\\/p><\\/div>`));
  });

  it('keeps the rest of the page unchanged when pdf_url is null', () => {
    const withPdf = renderLoaded(loadedDocument(SIGNED_URL, 'First paragraph.'));
    const withoutPdf = renderLoaded(loadedDocument(null, 'First paragraph.'));

    const viewer = withPdf.match(/<iframe\b[^>]*><\/iframe>/)?.[0];
    // The View source PDF link (SRS-207.1) also goes away with the PDF link.
    const sourceLink = withPdf.match(/<p class="mt-5"><a\b[^>]*>View source PDF<\/a><\/p>/)?.[0];
    expect(viewer).toBeDefined();
    expect(sourceLink).toBeDefined();
    expect(withoutPdf).toBe(
      withPdf.replace(sourceLink!, '').replace(viewer!, `<p class="text-fg-muted">${NOT_AVAILABLE}</p>`),
    );
  });
});
