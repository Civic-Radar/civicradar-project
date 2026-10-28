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

// API half: each from(table) call returns a chain that records its calls and
// resolves with the result registered for "<table>.<first method>". The chain
// has no write methods, so any write would throw.
const db = vi.hoisted(() => ({
  results: {} as Record<string, Result>,
  calls: [] as Call[],
}));

// Page half: the page gets its data only through useDocument, so the hook is
// replaced by whatever state a test sets. No fetch, no localStorage, no effects.
const hook = vi.hoisted(() => ({ state: { status: 'loading' } as DocumentState }));

// The rows below are stored PDFs, so the route asks Storage for a signed link
// (SRS-203.2). Storage builds the link from the stored path, as here.
const SIGNED_URL = vi.hoisted(
  () => 'https://example.supabase.co/storage/v1/object/sign/documents/1/1168.pdf?token=signed-token',
);

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
        from: vi.fn(() => ({
          createSignedUrl: vi.fn(async () => ({ data: { signedUrl: SIGNED_URL }, error: null })),
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
import { getSupabaseClient } from '../../lib/supabase';

const CONSOLE_METHODS = ['log', 'error', 'warn', 'info', 'debug'] as const;

const SELECTED_COLUMNS =
  'document_id, meeting_id, town_id, title, document_type, source_url, retrieved_at, summary_status, summary_text, summary_generated_at, storage_path, mime_type';

const RESPONSE_KEYS = [
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
];

const STORED_FILE_COLUMNS = ['storage_path', 'file_sha256', 'file_size_bytes', 'mime_type', 'source_file_id'];

const IDENTIFICATION = {
  document_id: 60,
  meeting_id: 42,
  town_id: 1,
  title: 'City Council Agenda Packet',
  document_type: 'Packet',
  source_url: 'https://example.org/files/60.pdf',
  retrieved_at: '2026-10-01T12:00:00+00:00',
};

// Columns the route must never return. The select reads only storage_path and
// mime_type (for the PDF link); the mock hands back all of them anyway to
// prove the response is built field by field.
const STORED_FILE = {
  storage_path: '1/1168.pdf',
  file_sha256: 'a'.repeat(64),
  file_size_bytes: 123456,
  mime_type: 'application/pdf',
  source_file_id: '1168',
};

const STORED_TEXT = '  First paragraph.\r\n\r\nSecond <script>alert(1)</script> &amp; more.  ';
const GENERATED_AT = '2026-10-02T08:30:00+00:00';

const COMPLETE_ROW = {
  ...IDENTIFICATION,
  ...STORED_FILE,
  summary_status: 'Complete',
  summary_text: STORED_TEXT,
  summary_generated_at: GENERATED_AT,
};
const PENDING_ROW = { ...IDENTIFICATION, ...STORED_FILE, summary_status: 'Pending', summary_text: null, summary_generated_at: null };
const FAILED_ROW = { ...IDENTIFICATION, ...STORED_FILE, summary_status: 'Failed', summary_text: null, summary_generated_at: null };

// Impossible under the table checks (text is set exactly when the status is
// Complete). These rows exist to prove the route gates on summary_status.
const PENDING_ROW_WITH_TEXT = { ...PENDING_ROW, summary_text: STORED_TEXT, summary_generated_at: GENERATED_AT };
// Impossible under the table checks, as above; proves the gate for Failed.
const FAILED_ROW_WITH_TEXT = { ...FAILED_ROW, summary_text: STORED_TEXT, summary_generated_at: GENERATED_AT };

function open(id = '60') {
  const request = new Request(`http://localhost/api/documents/${id}`, {
    headers: { authorization: 'Bearer valid-token' },
  });
  return GET(request, { params: { id } });
}

function storedRow(row: Record<string, unknown>) {
  db.results['documents.select'] = { data: row, error: null };
}

function callsTo(table: string, method: string) {
  return db.calls.filter((call) => call.table === table && call.method === method);
}

function loadedDocument(summary_text: string | null): DocumentIdentification {
  return {
    ...IDENTIFICATION,
    summary_text,
    summary_generated_at: summary_text === null ? null : GENERATED_AT,
    pdf_url: SIGNED_URL,
  };
}

// Vitest compiles this project's JSX to React.createElement, and the page does
// not import React, so React is stubbed as a global for the render.
function renderPage(state: DocumentState): string {
  hook.state = state;
  return renderToStaticMarkup(React.createElement(DocumentDetailPage, { params: { id: '60' } }));
}

function renderLoaded(summary_text: string | null): string {
  return renderPage({ status: 'loaded', document: loadedDocument(summary_text) });
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');
}

function summarySection(markup: string): string | undefined {
  return markup.match(/<section\b[^>]*>[\s\S]*?<\/section>/)?.[0];
}

// The text paragraphs inside the summary section (the div after the
// disclaimer), unescaped back to plain text.
function summaryParagraphs(markup: string): string[] {
  const textBlock = (summarySection(markup) ?? '').match(/<div\b[^>]*>[\s\S]*?<\/div>/)?.[0] ?? '';
  return Array.from(textBlock.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g), ([, inner]) => unescapeHtml(inner));
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('Network is disabled in tests');
    }),
  );
  for (const method of CONSOLE_METHODS) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

afterEach(() => {
  // Nothing reaches the network and nothing is logged, not even a React warning.
  expect(fetch).not.toHaveBeenCalled();
  for (const method of CONSOLE_METHODS) {
    expect(vi.mocked(console[method])).not.toHaveBeenCalled();
    vi.mocked(console[method]).mockRestore();
  }
  vi.unstubAllGlobals();
});

describe('GET /api/documents/[id] summary fields (SRS-204.2)', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
    vi.mocked(getSupabaseClient).mockClear();
    db.calls.length = 0;
    db.results = {};
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the stored text and timestamp of a Complete document, unchanged', async () => {
    storedRow(COMPLETE_ROW);

    const response = await open();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      document: { ...IDENTIFICATION, summary_text: STORED_TEXT, summary_generated_at: GENERATED_AT, pdf_url: SIGNED_URL },
    });
    // No trimming and no escaping.
    expect(body.document.summary_text).toBe(STORED_TEXT);
    expect(body.document.summary_generated_at).toBe(GENERATED_AT);
  });

  it.each([
    ['Pending', PENDING_ROW],
    ['Failed', FAILED_ROW],
  ])('returns null text and timestamp, both keys present, for a %s document', async (_status, row) => {
    storedRow(row);

    const response = await open();
    const text = await response.text();
    const body = JSON.parse(text);

    expect(response.status).toBe(200);
    expect(body).toEqual({
      document: { ...IDENTIFICATION, summary_text: null, summary_generated_at: null, pdf_url: SIGNED_URL },
    });
    expect(body.document).toHaveProperty('summary_text', null);
    expect(body.document).toHaveProperty('summary_generated_at', null);
    expect(text).toContain('"summary_text":null');
    expect(text).toContain('"summary_generated_at":null');
  });

  // These rows are impossible under the table checks. They carry text and a
  // timestamp only to prove the route gates on summary_status, not on null.
  it.each([
    ['Pending', PENDING_ROW_WITH_TEXT],
    ['Failed', FAILED_ROW_WITH_TEXT],
  ])('returns no summary for a %s row even when it carries text', async (_status, row) => {
    storedRow(row);

    const response = await open();
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      document: { ...IDENTIFICATION, summary_text: null, summary_generated_at: null, pdf_url: SIGNED_URL },
    });
    expect(text).not.toContain('First paragraph.');
    expect(text).not.toContain(GENERATED_AT);
  });

  it.each([
    ['Complete', COMPLETE_ROW],
    ['Pending', PENDING_ROW],
    ['Failed', FAILED_ROW],
  ])('returns exactly the ten keys and never summary_status for a %s document', async (status, row) => {
    storedRow(row);

    const response = await open();
    const text = await response.text();
    const body = JSON.parse(text);

    expect(Object.keys(body)).toEqual(['document']);
    expect(Object.keys(body.document).sort()).toEqual(RESPONSE_KEYS);
    expect(body.document).not.toHaveProperty('summary_status');
    expect(text).not.toContain('summary_status');
    expect(text).not.toContain(status);
  });

  it('reads one document with the exact select string', async () => {
    storedRow(COMPLETE_ROW);

    await open();

    expect(callsTo('documents', 'select')).toEqual([
      { table: 'documents', method: 'select', args: [SELECTED_COLUMNS] },
    ]);
    const eqCalls = callsTo('documents', 'eq');
    expect(eqCalls).toEqual([{ table: 'documents', method: 'eq', args: ['document_id', 60] }]);
    expect(typeof eqCalls[0].args[1]).toBe('number');
    expect(db.calls.map((call) => call.method)).toEqual(['select', 'eq', 'maybeSingle']);
    expect(new Set(db.calls.map((call) => call.table))).toEqual(new Set(['documents']));
  });

  it('never returns storage or hash fields, and reads only storage_path and mime_type for the PDF link', async () => {
    storedRow(COMPLETE_ROW);

    const response = await open();
    const text = await response.text();
    const body = JSON.parse(text);

    for (const column of STORED_FILE_COLUMNS) {
      expect(body.document).not.toHaveProperty(column);
      expect(text).not.toContain(column);
    }
    for (const column of ['file_sha256', 'file_size_bytes', 'source_file_id']) {
      expect(SELECTED_COLUMNS).not.toContain(column);
    }
    expect(text).not.toContain(STORED_FILE.file_sha256);
    // The stored path appears only inside the signed link that Storage builds.
    expect(text.replace(SIGNED_URL, '')).not.toContain(STORED_FILE.storage_path);
  });
});

describe('Document detail page summary section (SRS-204.2)', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React);
  });

  afterEach(() => {
    hook.state = { status: 'loading' };
  });

  it('shows a Complete document\'s text in paragraphs after the title', () => {
    const markup = renderLoaded('First paragraph.\n\nSecond paragraph.');

    expect(markup).toContain(`>${IDENTIFICATION.title}</h1>`);
    expect(summarySection(markup)).toMatch(/<h2\b[^>]*>Summary<\/h2>/);
    expect(summaryParagraphs(markup)).toEqual(['First paragraph.', 'Second paragraph.']);
    expect(markup.indexOf('</h1>')).toBeGreaterThan(-1);
    expect(markup.indexOf('</h1>')).toBeLessThan(markup.indexOf('<section'));
  });

  // The API returns both summary fields null for Pending and Failed, so the page
  // sees the same input for both.
  it('renders no summary for a Pending or Failed document, only the identification', () => {
    const withSummary = renderLoaded('First paragraph.\n\nSecond paragraph.');
    const markup = renderLoaded(null);

    expect(markup).not.toContain('<section');
    expect(markup).not.toContain('Summary');
    expect(markup).toContain(`>${IDENTIFICATION.title}</h1>`);
    // The only difference from the Complete page is the summary section.
    expect(markup).toBe(withSummary.replace(summarySection(withSummary)!, ''));
  });

  it.each([
    ['empty', ''],
    ['spaces', '   '],
    ['blank lines', '\n\n'],
    ['mixed whitespace', ' \r\n\t '],
  ])('renders no summary section for %s text', (_label, text) => {
    const markup = renderLoaded(text);

    expect(markup).not.toContain('<section');
    expect(markup).not.toContain('Summary');
    expect(markup).toBe(renderLoaded(null));
  });

  it.each([
    ['a blank line', 'A\n\nB', ['A', 'B']],
    ['a single newline', 'A\nB', ['A', 'B']],
    ['Windows line endings', 'A\r\nB\r\n\r\nC', ['A', 'B', 'C']],
    ['padded lines and several blank lines', '  A  \n\n\n  B ', ['A', 'B']],
    ['leading and trailing blank lines', '\n\nA\n\n', ['A']],
  ])('splits paragraphs on %s', (_label, text, expected) => {
    expect(summaryParagraphs(renderLoaded(text))).toEqual(expected);
  });

  it.each([
    ['a script tag', '<script>alert(1)</script>', '&lt;script&gt;alert(1)&lt;/script&gt;'],
    ['an HTML entity', '&amp;', '&amp;amp;'],
    ['markdown', '**bold**', '**bold**'],
  ])('shows %s as literal text', (_label, text, escaped) => {
    const markup = renderLoaded(text);

    expect(summaryParagraphs(markup)).toEqual([text]);
    expect(markup).toContain(escaped);
    expect(markup).not.toContain('<script');
    expect(markup).not.toMatch(/<(strong|b|em)\b/);
  });

  it.each([
    ['loading', { status: 'loading' }, 'Loading…'],
    ['signed out', { status: 'signedOut' }, 'Go to login'],
    ['not found', { status: 'notFound' }, 'Document not found'],
    ['load failed', { status: 'loadFailed' }, 'This document could not be loaded'],
  ] as [string, DocumentState, string][])('shows no summary in the %s state', (_label, state, marker) => {
    const markup = renderPage(state);

    expect(markup).toContain(marker);
    expect(markup).not.toContain('<section');
    expect(markup).not.toContain('Summary');
  });
});

describe('Document detail page AI-generated disclaimer (SRS-204.4)', () => {
  const DISCLAIMER = 'AI-generated summary. Verify against the source document.';

  beforeEach(() => {
    vi.stubGlobal('React', React);
  });

  afterEach(() => {
    hook.state = { status: 'loading' };
  });

  it('shows the exact sentence directly above a Complete document\'s summary text', () => {
    const section = summarySection(renderLoaded('First paragraph.\n\nSecond paragraph.')) ?? '';

    expect(section).toMatch(
      new RegExp(`<\\/h2><p\\b[^>]*>${DISCLAIMER.replace(/\./g, '\\.')}<\\/p><div\\b[^>]*><p>First paragraph\\.<\\/p>`),
    );
  });

  it('shows no disclaimer for a document with no summary', () => {
    expect(renderLoaded(null)).not.toContain(DISCLAIMER);
  });

  it('shows the sentence once, after the Summary heading and before the text', () => {
    const markup = renderLoaded('First paragraph.\n\nSecond paragraph.');
    const at = markup.indexOf(DISCLAIMER);

    expect(markup.split(DISCLAIMER)).toHaveLength(2);
    expect(at).toBeGreaterThan(markup.indexOf('Summary</h2>'));
    expect(at).toBeLessThan(markup.indexOf('First paragraph.'));
  });
});
