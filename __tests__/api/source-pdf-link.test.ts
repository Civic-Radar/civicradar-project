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
const SOURCE_URL = 'https://example.org/files/60.pdf';
const LINK_TEXT = 'View source PDF';
const SUMMARY_TEXT = 'The council approved the budget.';

// A Complete document: the API returns summary_text only when the summary is Complete.
const COMPLETE_DOCUMENT: DocumentIdentification = {
  document_id: 60,
  meeting_id: 42,
  town_id: 1,
  title: 'City Council Agenda Packet',
  document_type: 'Packet',
  source_url: SOURCE_URL,
  retrieved_at: '2026-10-01T12:00:00+00:00',
  summary_text: SUMMARY_TEXT,
  summary_generated_at: '2026-10-02T08:30:00+00:00',
  pdf_url: SIGNED_URL,
};

// Vitest compiles this project's JSX to React.createElement, and the page does
// not import React, so React is stubbed as a global for the render.
function renderLoaded(document: DocumentIdentification): string {
  hook.state = { status: 'loaded', document };
  return renderToStaticMarkup(React.createElement(DocumentDetailPage, { params: { id: '60' } }));
}

function summarySection(markup: string): string | undefined {
  return markup.match(/<section\b[^>]*>[\s\S]*?<\/section>/)?.[0];
}

function linksIn(markup: string): string[] {
  return Array.from(markup.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g), ([link]) => link);
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

describe('Document detail page View source PDF link (SRS-207.1)', () => {
  it('shows exactly one View source PDF link to the stored PDF inside the summary section', () => {
    const markup = renderLoaded(COMPLETE_DOCUMENT);
    const section = summarySection(markup) ?? '';

    expect(linksIn(markup)).toHaveLength(1);
    expect(linksIn(section)).toEqual([`<a href="${SIGNED_URL}" class="text-accent hover:underline">${LINK_TEXT}</a>`]);
    expect(markup.split(LINK_TEXT)).toHaveLength(2);
  });

  it('places the link after the summary text and before the section closes', () => {
    const markup = renderLoaded(COMPLETE_DOCUMENT);

    expect(markup).toMatch(
      new RegExp(`<p>${SUMMARY_TEXT.replace(/\./g, '\\.')}<\\/p><\\/div><p\\b[^>]*><a\\b[^>]*>${LINK_TEXT}<\\/a><\\/p><\\/section>`),
    );
    expect(markup.indexOf(SUMMARY_TEXT)).toBeLessThan(markup.indexOf(LINK_TEXT));
    expect(markup.indexOf(LINK_TEXT)).toBeLessThan(markup.indexOf('</section>'));
  });

  it('never links to the source address and sets no target or rel', () => {
    const markup = renderLoaded(COMPLETE_DOCUMENT);

    expect(markup).not.toContain(SOURCE_URL);
    expect(linksIn(markup)[0]).not.toMatch(/\b(target|rel)=/);
  });

  it.each([
    ['null', null],
    ['empty', ''],
    ['blank', '  \n '],
  ])('shows no link when the summary text is %s', (_label, summary_text) => {
    const markup = renderLoaded({ ...COMPLETE_DOCUMENT, summary_text, summary_generated_at: null });

    expect(markup).not.toContain('<section');
    expect(markup).not.toContain(LINK_TEXT);
    expect(linksIn(markup)).toEqual([]);
  });

  it('shows the summary but no link when pdf_url is null', () => {
    const markup = renderLoaded({ ...COMPLETE_DOCUMENT, pdf_url: null });

    expect(summarySection(markup)).toContain(`<p>${SUMMARY_TEXT}</p>`);
    expect(markup).not.toContain(LINK_TEXT);
    expect(linksIn(markup)).toEqual([]);
  });

  it('keeps the PDF viewer directly after the summary section', () => {
    const markup = renderLoaded(COMPLETE_DOCUMENT);

    expect(markup.split('<section').length - 1).toBe(1);
    expect(markup).toMatch(/<\/h1><section\b/);
    expect(markup).toMatch(/<\/a><\/p><\/section><iframe title="Document PDF"/);
    expect(markup.split('<iframe').length - 1).toBe(1);
  });
});
