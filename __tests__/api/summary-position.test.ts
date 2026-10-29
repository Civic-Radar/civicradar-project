import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentIdentification, DocumentState } from '../../app/(app)/documents/[id]/useDocument';

// @types/react-dom is not installed, so react-dom/server is loaded with only the
// one function this file uses typed here.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

// The page gets its data only through useDocument, so the hook is replaced by
// whatever state a test sets. No fetch, no localStorage, no effects.
const hook = vi.hoisted(() => ({ state: { status: 'loading' } as DocumentState }));

vi.mock('../../app/(app)/documents/[id]/useDocument', () => ({
  useDocument: () => hook.state,
}));

import DocumentDetailPage from '../../app/(app)/documents/[id]/page';

const CONSOLE_METHODS = ['log', 'error', 'warn', 'info', 'debug'] as const;

const SIGNED_URL = 'https://example.supabase.co/storage/v1/object/sign/documents/1/1168.pdf?token=signed-token';
const NOT_AVAILABLE = 'The PDF is not available.';
const SUMMARY_TEXT = 'The council approved the budget.';

// A Complete document: the API returns summary_text only when the summary is Complete.
const COMPLETE_DOCUMENT: DocumentIdentification = {
  document_id: 60,
  meeting_id: 42,
  town_id: 1,
  title: 'City Council Agenda Packet',
  document_type: 'Packet',
  source_url: 'https://example.org/files/60.pdf',
  retrieved_at: '2026-10-01T12:00:00+00:00',
  summary_text: SUMMARY_TEXT,
  summary_generated_at: '2026-10-02T08:30:00+00:00',
  pdf_url: SIGNED_URL,
};

// The summary section opens directly after the title's closing tag.
const SECTION_AFTER_TITLE = /<\/h1><section\b[^>]*><h2\b[^>]*>Summary<\/h2>/;

// The end of the summary section: the summary text, its wrapper, the section close.
const SECTION_END = `<p>${SUMMARY_TEXT}</p></div></section>`;

// With a PDF link, the View source PDF link (SRS-207.1, new tab per SRS-207.2) closes the section instead.
const SECTION_END_WITH_LINK = `<p>${SUMMARY_TEXT}</p></div><p class="mt-5"><a href="${SIGNED_URL}" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">View source PDF</a></p></section>`;

// Vitest compiles this project's JSX to React.createElement, and the page does
// not import React, so React is stubbed as a global for the render.
function renderLoaded(document: DocumentIdentification): string {
  hook.state = { status: 'loaded', document };
  return renderToStaticMarkup(React.createElement(DocumentDetailPage, { params: { id: '60' } }));
}

beforeEach(() => {
  vi.stubGlobal('React', React);
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
    expect(vi.mocked(console[method])).toHaveBeenCalledTimes(0);
    vi.mocked(console[method]).mockRestore();
  }
  vi.unstubAllGlobals();
  hook.state = { status: 'loading' };
});

describe('Document detail page summary position (SRS-205.1)', () => {
  it('puts the summary right after the title and the PDF viewer directly after the summary', () => {
    const markup = renderLoaded(COMPLETE_DOCUMENT);

    expect(markup.split('<section').length - 1).toBe(1);
    expect(markup).toMatch(SECTION_AFTER_TITLE);
    expect(markup).toContain(`${SECTION_END_WITH_LINK}<iframe title="Document PDF"`);
    expect(markup.split('<iframe').length - 1).toBe(1);
    expect(markup).not.toContain(NOT_AVAILABLE);
  });

  it('puts "The PDF is not available." directly after the summary when there is no PDF link', () => {
    const markup = renderLoaded({ ...COMPLETE_DOCUMENT, pdf_url: null });

    expect(markup.split('<section').length - 1).toBe(1);
    expect(markup).toMatch(SECTION_AFTER_TITLE);
    expect(markup).toContain(`${SECTION_END}<p class="text-fg-muted">${NOT_AVAILABLE}</p>`);
    expect(markup).not.toContain('<iframe');
  });
});
