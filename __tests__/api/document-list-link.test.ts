import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentListEntry, DocumentsState } from '../../app/(app)/documents/useDocuments';

// @types/react-dom is not installed, so react-dom/server is loaded with only the
// one function this file uses typed here.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

// The page gets its data only through useDocuments, so the hook is replaced by
// whatever state a test sets. No fetch, no localStorage, no effects.
const hook = vi.hoisted(() => ({ state: { status: 'loading' } as DocumentsState }));

vi.mock('../../app/(app)/documents/useDocuments', () => ({
  useDocuments: () => hook.state,
}));

import DocumentsPage from '../../app/(app)/documents/page';

const CONSOLE_METHODS = ['log', 'error', 'warn', 'info', 'debug'] as const;

type Anchor = { attributes: Record<string, string>; text: string };

function entry(document_id: number, title: string): DocumentListEntry {
  return { document_id, title, town_id: 1, meeting_id: 9, retrieved_at: '2026-10-01T12:00:00+00:00', town_name: 'Town A' };
}

// Vitest compiles this project's JSX to React.createElement, and the page does
// not import React, so React is stubbed as a global for the render.
function renderLoaded(documents: DocumentListEntry[]): string {
  hook.state = { status: 'loaded', documents };
  return renderToStaticMarkup(React.createElement(DocumentsPage));
}

function unescapeHtml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');
}

function anchorsIn(markup: string): Anchor[] {
  return Array.from(markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g), ([, attrs, inner]) => ({
    attributes: Object.fromEntries(
      Array.from(attrs.matchAll(/([^\s=]+)="([^"]*)"/g), ([, name, value]) => [name, unescapeHtml(value)]),
    ),
    text: unescapeHtml(inner.replace(/<[^>]*>/g, '')),
  }));
}

// Only the links to a document detail page, so other links on the page do not count.
function documentLinks(markup: string): Anchor[] {
  return anchorsIn(markup).filter((a) => a.attributes.href?.startsWith('/documents/'));
}

function listItems(markup: string): string[] {
  return Array.from(markup.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g), ([, inner]) => inner);
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
    expect(vi.mocked(console[method])).not.toHaveBeenCalled();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  hook.state = { status: 'loading' };
});

describe('Documents page entry links (SRS-203.1)', () => {
  it('links each entry to /documents/<document_id>', () => {
    const markup = renderLoaded([
      entry(7, 'Agenda'),
      entry(60, 'Minutes'),
      entry(1, 'Agenda Packet'),
      entry(9007199254740991, 'Largest id'),
    ]);

    expect(documentLinks(markup).map((a) => a.attributes.href)).toEqual([
      '/documents/7',
      '/documents/60',
      '/documents/1',
      '/documents/9007199254740991',
    ]);
  });

  it('opens the detail page in the same tab (no target attribute)', () => {
    const markup = renderLoaded([entry(7, 'Agenda'), entry(60, 'Minutes')]);

    const links = documentLinks(markup);
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link.attributes).not.toHaveProperty('target');
    }
    expect(markup).not.toContain('target=');
  });

  it('uses the title as the escaped link text', () => {
    const title = `Agenda & Packet <Draft> "Final" O'Brien`;
    const markup = renderLoaded([entry(7, title)]);

    expect(documentLinks(markup).map((a) => a.text)).toEqual([title]);
    expect(markup).toContain('Agenda &amp; Packet &lt;Draft&gt; &quot;Final&quot; O&#x27;Brien');
    expect(markup).not.toContain('<Draft>');
  });

  it('renders one entry with one link per document, in hook order (not sorted)', () => {
    const markup = renderLoaded([entry(104, 'Fourth'), entry(102, 'Second'), entry(103, 'Third')]);

    const items = listItems(markup);
    expect(items).toHaveLength(3);
    expect(items.map((inner) => documentLinks(inner).map((a) => [a.attributes.href, a.text]))).toEqual([
      [['/documents/104', 'Fourth']],
      [['/documents/102', 'Second']],
      [['/documents/103', 'Third']],
    ]);
  });

  it('renders no entry and no document link for an empty list', () => {
    const markup = renderLoaded([]);

    expect(listItems(markup)).toEqual([]);
    expect(documentLinks(markup)).toEqual([]);
    expect(markup).toContain('<h1');
  });
});
