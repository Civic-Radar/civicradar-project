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
// A recognizable fake CivicClerk portal page, the shape retrieval stores in source_url.
const CIVICCLERK_URL = 'https://faketown.portal.civicclerk.com/event/1192/overview';
const LINK_TEXT = 'Open on CivicClerk';
const SOURCE_PDF_TEXT = 'View source PDF';
const NOT_AVAILABLE = 'The PDF is not available.';
const SUMMARY_TEXT = 'The council approved the budget.';

// A Complete document as the API returns it.
const COMPLETE_DOCUMENT: DocumentIdentification = {
  document_id: 60,
  meeting_id: 42,
  town_id: 1,
  title: 'City Council Agenda Packet',
  document_type: 'Packet',
  source_url: CIVICCLERK_URL,
  retrieved_at: '2026-10-01T12:00:00+00:00',
  summary_status: 'Complete',
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

// The attributes of the link whose whole text is `text`, or null when there is none.
function linkNamed(markup: string, text: string): Record<string, string> | null {
  const match = markup.match(new RegExp(`<a\\b([^>]*)>${text}<\\/a>`));
  return match ? attributesOf(match[1]) : null;
}

function linkTexts(markup: string): string[] {
  return Array.from(markup.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g), ([, inner]) => inner);
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

describe('Open on CivicClerk link on the detail page (SRS-207.4)', () => {
  it('shows a link with the exact text Open on CivicClerk whose href is the document\'s source_url', () => {
    const markup = renderLoaded(COMPLETE_DOCUMENT);
    const link = linkNamed(markup, LINK_TEXT);

    expect(link).not.toBeNull();
    expect(link!.href).toBe(COMPLETE_DOCUMENT.source_url);
    expect(linkTexts(markup).filter((text) => text.includes('CivicClerk'))).toEqual([LINK_TEXT]);
  });

  it('follows each document\'s own source_url', () => {
    const other = 'http://othertown.portal.civicclerk.com/event/7/overview';
    const markup = renderLoaded({ ...COMPLETE_DOCUMENT, source_url: other });

    expect(linkNamed(markup, LINK_TEXT)!.href).toBe(other);
  });

  it('opens in a new tab with a rel containing noopener', () => {
    const link = linkNamed(renderLoaded(COMPLETE_DOCUMENT), LINK_TEXT)!;

    expect(link.target).toBe('_blank');
    expect(link.rel.split(/\s+/)).toContain('noopener');
  });

  it('uses the same token classes as the View source PDF link', () => {
    const markup = renderLoaded(COMPLETE_DOCUMENT);

    expect(linkNamed(markup, LINK_TEXT)!.class).toBe(linkNamed(markup, SOURCE_PDF_TEXT)!.class);
  });

  it('comes after the title and before the summary section', () => {
    const markup = renderLoaded(COMPLETE_DOCUMENT);
    const at = markup.indexOf(`>${LINK_TEXT}</a>`);

    expect(at).toBeGreaterThan(markup.indexOf(`>${COMPLETE_DOCUMENT.title}</h1>`));
    expect(at).toBeLessThan(markup.indexOf('<section'));
    expect(markup).toMatch(new RegExp(`<\\/h1><p><a\\b[^>]*>${LINK_TEXT}<\\/a><\\/p><section\\b`));
  });

  it('still shows the link when the document has no summary', () => {
    const markup = renderLoaded({ ...COMPLETE_DOCUMENT, summary_text: null, summary_generated_at: null });

    expect(markup).not.toContain('<section');
    expect(linkNamed(markup, LINK_TEXT)!.href).toBe(CIVICCLERK_URL);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['a relative path', '/event/1192/overview'],
    ['a javascript address', 'javascript:alert(1)'],
    ['an ftp address', 'ftp://faketown.portal.civicclerk.com/event/1192/overview'],
    ['an address with no scheme', 'faketown.portal.civicclerk.com/event/1192/overview'],
  ])('shows no Open on CivicClerk link when source_url is %s', (_label, source_url) => {
    const markup = renderLoaded({ ...COMPLETE_DOCUMENT, source_url: source_url as unknown as string });

    expect(markup).not.toContain(LINK_TEXT);
    expect(markup).toMatch(/<\/h1><section\b/);
    // The rest of the page is unchanged: only the View source PDF link remains.
    expect(linkTexts(markup)).toEqual([SOURCE_PDF_TEXT]);
  });

  it('keeps the View source PDF link on the stored copy link, never on source_url', () => {
    const markup = renderLoaded(COMPLETE_DOCUMENT);
    const sourcePdf = linkNamed(markup, SOURCE_PDF_TEXT)!;

    expect(sourcePdf.href).toBe(SIGNED_URL);
    expect(sourcePdf.href).not.toBe(COMPLETE_DOCUMENT.source_url);
    expect(sourcePdf.href).not.toMatch(/civicclerk\.com/i);
    expect(markup.split(CIVICCLERK_URL)).toHaveLength(2);
  });

  it('keeps the PDF viewer directly after the summary section', () => {
    const markup = renderLoaded(COMPLETE_DOCUMENT);

    expect(markup.split('<section').length - 1).toBe(1);
    expect(markup).toMatch(/<\/section><iframe title="Document PDF"/);
    expect(markup.split('<iframe').length - 1).toBe(1);
  });

  it('keeps "The PDF is not available." directly after the summary section when there is no PDF link', () => {
    const markup = renderLoaded({ ...COMPLETE_DOCUMENT, pdf_url: null });

    expect(linkNamed(markup, LINK_TEXT)!.href).toBe(CIVICCLERK_URL);
    expect(markup).toContain(`</section><p class="text-fg-muted">${NOT_AVAILABLE}</p>`);
    expect(markup).not.toContain('<iframe');
  });
});
