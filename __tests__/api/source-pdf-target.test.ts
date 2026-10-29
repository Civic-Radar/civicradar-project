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
// result a test sets. Nothing reaches Storage.
const storage = vi.hoisted(() => ({
  result: { data: null, error: null } as Result,
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
// A recognizable fake CivicClerk portal page, the shape retrieval stores in source_url.
const CIVICCLERK_URL = 'https://faketown.portal.civicclerk.com/event/1192/overview';
const LINK_TEXT = 'View source PDF';
const SUMMARY_TEXT = 'The council approved the budget.';

const IDENTIFICATION = {
  document_id: 60,
  meeting_id: 42,
  town_id: 1,
  title: 'City Council Agenda Packet',
  document_type: 'Packet',
  source_url: CIVICCLERK_URL,
  retrieved_at: '2026-10-01T12:00:00+00:00',
};

const STORED_ROW = {
  ...IDENTIFICATION,
  storage_path: '1/1168.pdf',
  mime_type: 'application/pdf',
  summary_status: 'Complete',
  summary_text: SUMMARY_TEXT,
  summary_generated_at: '2026-10-02T08:30:00+00:00',
};

// A Complete document as the API returns it.
const COMPLETE_DOCUMENT: DocumentIdentification = {
  ...IDENTIFICATION,
  summary_text: SUMMARY_TEXT,
  summary_generated_at: '2026-10-02T08:30:00+00:00',
  pdf_url: SIGNED_URL,
};

function open(id = '60') {
  const request = new Request(`http://localhost/api/documents/${id}`, {
    headers: { authorization: 'Bearer valid-token' },
  });
  return GET(request, { params: { id } });
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

function elementsIn(markup: string, tag: string): Record<string, string>[] {
  return Array.from(markup.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g')), ([, attrs]) => attributesOf(attrs));
}

function sourcePdfLink(markup: string): Record<string, string> {
  const match = markup.match(new RegExp(`<a\\b([^>]*)>${LINK_TEXT}<\\/a>`));
  expect(match).not.toBeNull();
  return attributesOf(match![1]);
}

// Every attribute value on the page that can send the browser somewhere.
function linkTargets(markup: string): string[] {
  return Array.from(
    markup.matchAll(/\b(?:href|src|action|formaction|data|srcset|poster)="([^"]*)"/g),
    ([, value]) => unescapeHtml(value),
  );
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
});

afterEach(() => {
  // Nothing reaches the network and nothing is logged, not even a React warning.
  expect(fetch).not.toHaveBeenCalled();
  for (const method of CONSOLE_METHODS) {
    expect(vi.mocked(console[method])).toHaveBeenCalledTimes(0);
    vi.mocked(console[method]).mockRestore();
  }
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  hook.state = { status: 'loading' };
});

describe('View source PDF link target on the detail page (SRS-207.2)', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React);
  });

  it('links to exactly the pdf_url given to the page', () => {
    const markup = renderLoaded(COMPLETE_DOCUMENT);

    expect(sourcePdfLink(markup).href).toBe(COMPLETE_DOCUMENT.pdf_url);
  });

  it('opens in a new tab with a rel containing noopener', () => {
    const link = sourcePdfLink(renderLoaded(COMPLETE_DOCUMENT));

    expect(link.target).toBe('_blank');
    expect(link.rel.split(/\s+/)).toContain('noopener');
  });

  it('never shows the CivicClerk source_url as any link target on the page', () => {
    const markup = renderLoaded(COMPLETE_DOCUMENT);
    const targets = linkTargets(markup);

    expect(targets.length).toBeGreaterThan(0);
    for (const target of targets) {
      expect(target).not.toContain(CIVICCLERK_URL);
      expect(target).not.toMatch(/civicclerk\.com/i);
    }
    expect(markup).not.toContain(CIVICCLERK_URL);
    expect(sourcePdfLink(markup).href).not.toBe(COMPLETE_DOCUMENT.source_url);
  });

  it('uses the same stored copy link for the viewer and the link (the viewer adds #page=1)', () => {
    const markup = renderLoaded(COMPLETE_DOCUMENT);
    const iframes = elementsIn(markup, 'iframe');
    const href = sourcePdfLink(markup).href;

    expect(iframes).toHaveLength(1);
    expect(iframes[0].src).toBe(`${href}#page=1`);
    expect(href).toBe(SIGNED_URL);
  });
});

describe('GET /api/documents/[id] stored copy link for View source PDF (SRS-207.2)', () => {
  it('asks Storage to sign the stored object in the documents bucket for 3600 seconds', async () => {
    db.results['documents.select'] = { data: STORED_ROW, error: null };

    const response = await open();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(storage.calls).toEqual([{ bucket: 'documents', path: STORED_ROW.storage_path, expiresIn: 3600 }]);
    expect(body.document.pdf_url).toBe(SIGNED_URL);
    expect(body.document.pdf_url).not.toBe(body.document.source_url);
  });

  it('gives the page a link that points to the signed stored copy, not to source_url', async () => {
    db.results['documents.select'] = { data: STORED_ROW, error: null };
    vi.stubGlobal('React', React);

    const body = await (await open()).json();
    const markup = renderLoaded(body.document as DocumentIdentification);

    expect(body.document.source_url).toBe(CIVICCLERK_URL);
    expect(sourcePdfLink(markup).href).toBe(body.document.pdf_url);
    expect(markup).not.toContain(CIVICCLERK_URL);
  });
});
