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
type SignCall = { bucket: string; path: string; expiresIn: number };

// API half: each from(table) call returns a read-only chain that resolves with
// the result registered for "<table>.<first method>".
const db = vi.hoisted(() => ({
  results: {} as Record<string, Result>,
}));

// Storage half: createSignedUrl records its arguments and answers with a link
// built from the stored path, so a link can be traced back to its file.
// Nothing reaches Storage.
const storage = vi.hoisted(() => ({
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
      builder[method] = () => {
        if (!operation) operation = method;
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
            return { data: { signedUrl: signedUrlFor(path) }, error: null };
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

const STORAGE_PATH = '1/1168.pdf';
const NOT_AVAILABLE = 'The PDF is not available.';
const PENDING_MESSAGE = 'Summary pending';
const FAILED_MESSAGE = 'A summary could not be generated for this document. You can still read the original PDF below.';
const SUMMARY_TEXT = 'The council approved the budget.';
const GENERATED_AT = '2026-10-02T08:30:00+00:00';

function signedUrlFor(path: string): string {
  return `https://example.supabase.co/storage/v1/object/sign/documents/${path}?token=signed-token`;
}

const SIGNED_URL = signedUrlFor(STORAGE_PATH);

const IDENTIFICATION = {
  document_id: 60,
  meeting_id: 42,
  town_id: 1,
  title: 'City Council Agenda Packet',
  document_type: 'Packet',
  source_url: 'https://example.org/files/60.pdf',
  retrieved_at: '2026-10-01T12:00:00+00:00',
};

type Status = DocumentIdentification['summary_status'];

// Summary fields per status, as the table checks allow them: Complete exactly
// when the text is set.
const SUMMARY_FIELDS: Record<Status, { summary_text: string | null; summary_generated_at: string | null }> = {
  Pending: { summary_text: null, summary_generated_at: null },
  Complete: { summary_text: SUMMARY_TEXT, summary_generated_at: GENERATED_AT },
  Failed: { summary_text: null, summary_generated_at: null },
};

// What each status shows inside the summary section, besides the heading.
const SECTION_CONTENT: Record<Status, string> = {
  Pending: PENDING_MESSAGE,
  Complete: SUMMARY_TEXT,
  Failed: FAILED_MESSAGE,
};

const STATUSES: Status[] = ['Pending', 'Complete', 'Failed'];

function storedRow(status: Status, fields: Record<string, unknown> = {}) {
  return {
    ...IDENTIFICATION,
    storage_path: STORAGE_PATH,
    mime_type: 'application/pdf',
    summary_status: status,
    ...SUMMARY_FIELDS[status],
    ...fields,
  };
}

async function open(row: Record<string, unknown>) {
  db.results['documents.select'] = { data: row, error: null };
  const request = new Request('http://localhost/api/documents/60', {
    headers: { authorization: 'Bearer valid-token' },
  });
  const response = await GET(request, { params: { id: '60' } });
  return { status: response.status, body: await response.json() };
}

function loadedDocument(status: Status, pdf_url: string | null): DocumentIdentification {
  return { ...IDENTIFICATION, summary_status: status, ...SUMMARY_FIELDS[status], pdf_url };
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

function summarySection(markup: string): string | undefined {
  return markup.match(/<section\b[^>]*>[\s\S]*?<\/section>/)?.[0];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
  db.results = {};
  storage.calls.length = 0;
});

afterEach(() => {
  // Nothing reaches the network and nothing is logged, not even a React warning.
  expect(fetch).not.toHaveBeenCalled();
  for (const method of CONSOLE_METHODS) {
    expect(vi.mocked(console[method])).not.toHaveBeenCalled();
    vi.mocked(console[method]).mockRestore();
  }
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  hook.state = { status: 'loading' };
});

describe('GET /api/documents/[id] PDF link for any summary status (SRS-211.1)', () => {
  it.each(STATUSES)('returns the stored PDF link and the status for a %s document', async (status) => {
    const { status: code, body } = await open(storedRow(status));

    expect(code).toBe(200);
    expect(body.document.summary_status).toBe(status);
    expect(body.document.pdf_url).not.toBeNull();
    expect(body.document.pdf_url).toBe(SIGNED_URL);
    expect(storage.calls).toEqual([{ bucket: 'documents', path: STORAGE_PATH, expiresIn: 3600 }]);
  });

  it('returns the same link for the same stored file whatever the status', async () => {
    const links: string[] = [];
    for (const status of STATUSES) {
      links.push((await open(storedRow(status))).body.document.pdf_url);
    }

    expect(links).toEqual([SIGNED_URL, SIGNED_URL, SIGNED_URL]);
    expect(storage.calls.map((call) => call.path)).toEqual([STORAGE_PATH, STORAGE_PATH, STORAGE_PATH]);
  });

  it.each(STATUSES)('returns pdf_url null and asks Storage nothing for a %s document with no stored PDF', async (status) => {
    const { status: code, body } = await open(storedRow(status, { storage_path: null }));

    expect(code).toBe(200);
    expect(body.document.summary_status).toBe(status);
    expect(body.document).toHaveProperty('pdf_url', null);
    expect(storage.calls).toEqual([]);
  });
});

describe('Document detail page PDF for any summary status (SRS-211.1)', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React);
  });

  it.each(STATUSES)('shows page 1 of the PDF in one iframe titled "Document PDF" for a %s document', (status) => {
    const markup = renderLoaded(loadedDocument(status, SIGNED_URL));

    const iframes = iframesIn(markup);
    expect(iframes).toHaveLength(1);
    expect(iframes[0].title).toBe('Document PDF');
    expect(iframes[0].src).toBe(`${SIGNED_URL}#page=1`);
    expect(markup).not.toContain(NOT_AVAILABLE);
  });

  it.each(STATUSES)('places the viewer directly after the summary section of a %s document', (status) => {
    const markup = renderLoaded(loadedDocument(status, SIGNED_URL));
    const section = summarySection(markup) ?? '';

    expect(section).toMatch(/<h2\b[^>]*>Summary<\/h2>/);
    expect(section).toContain(SECTION_CONTENT[status]);
    expect(markup.split('<section').length - 1).toBe(1);
    expect(markup).toMatch(/<\/section><iframe\b/);
  });

  it.each(STATUSES)('shows the PDF from the route response of a %s document', async (status) => {
    const { body } = await open(storedRow(status));
    const markup = renderLoaded(body.document);

    expect(iframesIn(markup).map((iframe) => [iframe.title, iframe.src])).toEqual([
      ['Document PDF', `${SIGNED_URL}#page=1`],
    ]);
    expect(markup).not.toContain(NOT_AVAILABLE);
  });

  it.each(STATUSES)('shows "The PDF is not available." after the summary section of a %s document with no stored PDF', (status) => {
    const markup = renderLoaded(loadedDocument(status, null));

    expect(iframesIn(markup)).toEqual([]);
    expect(summarySection(markup)).toContain(SECTION_CONTENT[status]);
    expect(markup).toMatch(
      new RegExp(`<\\/section><p class="text-fg-muted">${escapeRegExp(NOT_AVAILABLE)}<\\/p><\\/div>`),
    );
  });
});
