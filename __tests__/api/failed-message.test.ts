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
// (SRS-203.2). Nothing reaches Storage.
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

const CONSOLE_METHODS = ['log', 'error', 'warn', 'info', 'debug'] as const;

// SRS-210.2, word for word.
const FAILED_MESSAGE = 'A summary could not be generated for this document. You can still read the original PDF below.';
const DISCLAIMER = 'AI-generated summary. Verify against the source document.';
const SOURCE_PDF_TEXT = 'View source PDF';
const NOT_AVAILABLE = 'The PDF is not available.';
const SUMMARY_TEXT = 'The council approved the budget.';
const GENERATED_AT = '2026-10-02T08:30:00+00:00';
const SOURCE_URL = 'https://example.org/files/60.pdf';

const IDENTIFICATION = {
  document_id: 60,
  meeting_id: 42,
  town_id: 1,
  title: 'City Council Agenda Packet',
  document_type: 'Packet',
  source_url: SOURCE_URL,
  retrieved_at: '2026-10-01T12:00:00+00:00',
};

const STORED_FILE = { storage_path: '1/1168.pdf', mime_type: 'application/pdf' };

const COMPLETE_ROW = {
  ...IDENTIFICATION,
  ...STORED_FILE,
  summary_status: 'Complete',
  summary_text: SUMMARY_TEXT,
  summary_generated_at: GENERATED_AT,
};
const PENDING_ROW = { ...IDENTIFICATION, ...STORED_FILE, summary_status: 'Pending', summary_text: null, summary_generated_at: null };
const FAILED_ROW = { ...IDENTIFICATION, ...STORED_FILE, summary_status: 'Failed', summary_text: null, summary_generated_at: null };

// Documents as the API returns them.
const COMPLETE_DOCUMENT: DocumentIdentification = {
  ...IDENTIFICATION,
  summary_status: 'Complete',
  summary_text: SUMMARY_TEXT,
  summary_generated_at: GENERATED_AT,
  pdf_url: SIGNED_URL,
};
const PENDING_DOCUMENT: DocumentIdentification = {
  ...IDENTIFICATION,
  summary_status: 'Pending',
  summary_text: null,
  summary_generated_at: null,
  pdf_url: SIGNED_URL,
};
const FAILED_DOCUMENT: DocumentIdentification = { ...PENDING_DOCUMENT, summary_status: 'Failed' };

function open(id = '60') {
  const request = new Request(`http://localhost/api/documents/${id}`, {
    headers: { authorization: 'Bearer valid-token' },
  });
  return GET(request, { params: { id } });
}

function storedRow(row: Record<string, unknown>) {
  db.results['documents.select'] = { data: row, error: null };
}

// Vitest compiles this project's JSX to React.createElement, and the page does
// not import React, so React is stubbed as a global for the render.
function renderLoaded(document: DocumentIdentification): string {
  hook.state = { status: 'loaded', document };
  return renderToStaticMarkup(React.createElement(DocumentDetailPage, { params: { id: '60' } }));
}

function summarySection(markup: string): string | undefined {
  return markup.match(/<section\b[^>]*>[\s\S]*?<\/section>/)?.[0];
}

function paragraphsIn(markup: string): string[] {
  return Array.from(markup.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g), ([, inner]) => inner);
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
  db.calls.length = 0;
  db.results = {};
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

describe('GET /api/documents/[id] summary status (SRS-210.2)', () => {
  it.each([
    ['Pending', PENDING_ROW],
    ['Failed', FAILED_ROW],
  ])('returns summary_status %s with no summary text or time', async (status, row) => {
    storedRow(row);

    const response = await open();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      document: { ...IDENTIFICATION, summary_status: status, summary_text: null, summary_generated_at: null, pdf_url: SIGNED_URL },
    });
  });

  it('returns summary_status Complete with the stored text and time', async () => {
    storedRow(COMPLETE_ROW);

    const response = await open();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      document: {
        ...IDENTIFICATION,
        summary_status: 'Complete',
        summary_text: SUMMARY_TEXT,
        summary_generated_at: GENERATED_AT,
        pdf_url: SIGNED_URL,
      },
    });
  });

  it('never sends the Failed message itself: the page decides what to show', async () => {
    storedRow(FAILED_ROW);

    const text = await (await open()).text();

    expect(text).not.toContain(FAILED_MESSAGE);
  });
});

describe('Document detail page Failed message (SRS-210.2)', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React);
  });

  it('shows the exact message once, as one paragraph inside the Summary section', () => {
    const markup = renderLoaded(FAILED_DOCUMENT);
    const section = summarySection(markup) ?? '';

    expect(section).toMatch(/<h2\b[^>]*>Summary<\/h2>/);
    expect(paragraphsIn(section)).toEqual([FAILED_MESSAGE]);
    expect(markup.split(FAILED_MESSAGE)).toHaveLength(2);
    expect(markup.indexOf(FAILED_MESSAGE)).toBeGreaterThan(markup.indexOf('<section'));
    expect(markup.indexOf(FAILED_MESSAGE)).toBeLessThan(markup.indexOf('</section>'));
  });

  it('places the section directly before the PDF viewer, after the title and the Open on CivicClerk link', () => {
    const markup = renderLoaded(FAILED_DOCUMENT);

    expect(markup).toMatch(/<\/section><iframe\b/);
    expect(markup.match(/<iframe\b/g)).toHaveLength(1);
    expect(markup.indexOf('</h1>')).toBeGreaterThan(-1);
    expect(markup.indexOf('</h1>')).toBeLessThan(markup.indexOf('Open on CivicClerk'));
    expect(markup.indexOf('Open on CivicClerk')).toBeLessThan(markup.indexOf('<section'));
  });

  it('shows no AI-generated disclaimer and no View source PDF link', () => {
    const markup = renderLoaded(FAILED_DOCUMENT);

    expect(markup).not.toContain(DISCLAIMER);
    expect(markup).not.toContain(SOURCE_PDF_TEXT);
    // The only link on the page is Open on CivicClerk (SRS-207.4).
    expect(markup.match(/<a\b[^>]*>[\s\S]*?<\/a>/g)).toEqual([
      `<a href="${SOURCE_URL}" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">Open on CivicClerk</a>`,
    ]);
  });

  it('shows the not-available line directly after the section when there is no PDF link', () => {
    const markup = renderLoaded({ ...FAILED_DOCUMENT, pdf_url: null });

    expect(markup).not.toContain('<iframe');
    expect(summarySection(markup)).toContain(FAILED_MESSAGE);
    expect(markup).toMatch(
      new RegExp(`<\\/section><p class="text-fg-muted">${escapeRegExp(NOT_AVAILABLE)}<\\/p><\\/div>`),
    );
  });

  it('shows no message for a Complete document', () => {
    const markup = renderLoaded(COMPLETE_DOCUMENT);

    expect(markup).not.toContain(FAILED_MESSAGE);
    expect(summarySection(markup)).toContain(SUMMARY_TEXT);
    expect(summarySection(markup)).toContain(DISCLAIMER);
  });

  it('shows no Failed message for a Pending document: its section holds the Pending message instead', () => {
    const pending = renderLoaded(PENDING_DOCUMENT);
    const failed = renderLoaded(FAILED_DOCUMENT);

    expect(paragraphsIn(summarySection(pending) ?? '')).toEqual(['Summary pending']);
    expect(pending).not.toContain(FAILED_MESSAGE);
    expect(pending).toMatch(/<\/section><iframe\b/);
    // The Failed page is the Pending page with the Failed message in place of the Pending message (SRS-206.1).
    expect(failed).toBe(pending.replace('>Summary pending</p>', `>${FAILED_MESSAGE}</p>`));
  });

  it('shows the message for the Failed document the route returns', async () => {
    storedRow(FAILED_ROW);

    const body = await (await open()).json();
    const markup = renderLoaded(body.document as DocumentIdentification);

    expect(summarySection(markup)).toContain(FAILED_MESSAGE);
    expect(markup).toMatch(/<\/section><iframe\b/);
  });
});
