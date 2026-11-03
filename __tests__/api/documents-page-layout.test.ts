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
import { documentsOfType } from '../../app/(app)/documents/documentsOfType';

const CONSOLE_METHODS = ['log', 'error', 'warn', 'info', 'debug'] as const;

type Overrides = Partial<DocumentListEntry> & Pick<DocumentListEntry, 'document_id'>;

function entry(overrides: Overrides): DocumentListEntry {
  return {
    title: `Document ${overrides.document_id}`,
    town_id: 1,
    meeting_id: 9,
    retrieved_at: '2026-10-01T12:00:00+00:00',
    summary_status: 'Pending',
    document_type: 'Agenda',
    town_name: 'Salem',
    // Midday UTC, so the date is the same in any US time zone.
    meeting_start_at: '2026-10-19T16:00:00+00:00',
    ...overrides,
  };
}

// Vitest compiles this project's JSX to React.createElement, and the page does
// not import React, so React is stubbed as a global for the render.
function render(documents: DocumentListEntry[]): string {
  hook.state = { status: 'loaded', documents };
  return renderToStaticMarkup(React.createElement(DocumentsPage));
}

function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

function listItems(markup: string): string[] {
  return Array.from(markup.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g), ([, inner]) => inner);
}

function detailsLine(item: string): string | undefined {
  return item.match(/<p class="mt-1 text-sm text-fg-muted">([\s\S]*?)<\/p>/)?.[1];
}

function pill(item: string): { classes: string; inner: string } | null {
  const match = item.match(/<span class="(inline-flex w-fit[^"]*)">([\s\S]*?)<\/span>/);
  return match ? { classes: match[1], inner: match[2] } : null;
}

function count(markup: string, tag: string): number {
  return Array.from(markup.matchAll(new RegExp(`<${tag}\\b`, 'g'))).length;
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

describe('Documents page header', () => {
  it('shows the uppercase eyebrow, the title and the subtitle', () => {
    const markup = render([entry({ document_id: 1 })]);

    expect(markup).toMatch(/<p class="[^"]*\buppercase\b[^"]*">The public record<\/p>/);
    expect(markup).toMatch(/<h1[^>]*>Documents<\/h1>/);
    expect(markup).toContain('A little more context for the decisions happening around you.');
  });

  it('has no Towns I follow or All towns tabs', () => {
    const markup = render([entry({ document_id: 1 })]);

    expect(markup).not.toContain('Towns I follow');
    expect(markup).not.toContain('All towns');
    expect(count(markup, 'button')).toBe(0);
  });
});

describe('Documents page type filter and status line', () => {
  it('has one dropdown: All documents, then Agenda, Packet, Minutes and Other', () => {
    const markup = render([entry({ document_id: 1 })]);

    expect(count(markup, 'select')).toBe(1);
    const options = Array.from(markup.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g), ([, attrs, text]) => ({
      value: attrs.match(/value="([^"]*)"/)?.[1],
      text,
      selected: /\bselected=""/.test(attrs),
    }));
    expect(options).toEqual([
      { value: '', text: 'All documents', selected: true },
      { value: 'Agenda', text: 'Agenda', selected: false },
      { value: 'Packet', text: 'Packet', selected: false },
      { value: 'Minutes', text: 'Minutes', selected: false },
      { value: 'Other', text: 'Other', selected: false },
    ]);
    expect(markup).toMatch(/<label[^>]*><span class="sr-only">Document type<\/span><select/);
  });

  it('documentsOfType keeps every document for All documents and only the chosen type otherwise, in order', () => {
    const documents = [
      entry({ document_id: 1, document_type: 'Packet' }),
      entry({ document_id: 2, document_type: 'Agenda' }),
      entry({ document_id: 3, document_type: 'Packet' }),
      entry({ document_id: 4, document_type: 'Minutes' }),
    ];

    expect(documentsOfType(documents, '').map((doc) => doc.document_id)).toEqual([1, 2, 3, 4]);
    expect(documentsOfType(documents, 'Packet').map((doc) => doc.document_id)).toEqual([1, 3]);
    expect(documentsOfType(documents, 'Other')).toEqual([]);
  });

  it('shows "N documents" and the true sort label', () => {
    const text = textOf(render([entry({ document_id: 1 }), entry({ document_id: 2 }), entry({ document_id: 3 })]));

    expect(text).toContain('3 documents');
    expect(text).toContain('Newest first');
    expect(text).not.toContain('Newest meeting first');
  });

  it('says 1 document for a single document and 0 documents for none', () => {
    expect(textOf(render([entry({ document_id: 1 })]))).toContain('1 document');
    expect(textOf(render([entry({ document_id: 1 })]))).not.toContain('1 documents');
    expect(textOf(render([]))).toContain('0 documents');
  });

  it('lists the entries in the hook order, not re-sorted', () => {
    const items = listItems(render([entry({ document_id: 30 }), entry({ document_id: 10 }), entry({ document_id: 20 })]));

    expect(items.map((item) => item.match(/href="([^"]*)"/)?.[1])).toEqual(['/documents/30', '/documents/10', '/documents/20']);
  });
});

describe('Documents page rows', () => {
  it('each row links its title to the detail page and shows type, town and meeting date', () => {
    const [item] = listItems(render([entry({ document_id: 7, title: 'City Council Agenda', document_type: 'Packet' })]));

    expect(item).toMatch(/<a\b[^>]*href="\/documents\/7"[^>]*>City Council Agenda<\/a>/);
    expect(detailsLine(item)).toBe('Packet · Salem · 10/19/2026');
  });

  it('shows Date not available when the meeting date is missing, and leaves out a missing town', () => {
    const [item] = listItems(render([entry({ document_id: 7, meeting_start_at: null, town_name: null })]));

    expect(detailsLine(item)).toBe('Agenda · Date not available');
  });

  it.each<[DocumentListEntry['document_type'], string]>([
    ['Agenda', 'bg-accent-wash text-accent-strong'],
    ['Packet', 'bg-info-soft/10 text-info-soft'],
    ['Minutes', 'bg-warning/10 text-warning'],
    ['Other', 'bg-raised text-fg-muted'],
  ])('tints the icon tile of a %s by its type', (documentType, tint) => {
    const [item] = listItems(render([entry({ document_id: 7, document_type: documentType })]));

    const tile = item.match(/<div class="([^"]*)" aria-hidden="true"><svg/)?.[1] ?? '';
    expect(tile).toContain('rounded-lg');
    expect(tile).toContain(tint);
  });

  it.each<[DocumentListEntry['summary_status'], string, string]>([
    ['Pending', 'Summary pending', 'bg-warning/10 text-warning'],
    ['Complete', 'Summary ready', 'bg-accent-wash text-accent-strong'],
    ['Failed', 'Summary failed', 'bg-danger-wash text-danger-soft'],
  ])('a %s entry shows the "%s" pill', (status, text, tone) => {
    const [item] = listItems(render([entry({ document_id: 7, summary_status: status })]));

    const found = pill(item);
    expect(textOf(found?.inner ?? '')).toBe(text);
    expect(found?.classes).toContain(tone);
  });

  it('puts the sparkle icon only in the Summary ready pill', () => {
    const items = listItems(render([
      entry({ document_id: 1, summary_status: 'Complete' }),
      entry({ document_id: 2, summary_status: 'Pending' }),
      entry({ document_id: 3, summary_status: 'Failed' }),
    ]));

    expect(items.map((item) => /^<svg\b[^>]*aria-hidden="true"/.test(pill(item)?.inner ?? ''))).toEqual([true, false, false]);
  });

  it('ends each row with a chevron icon after the pill', () => {
    const [item] = listItems(render([entry({ document_id: 7 })]));

    expect(item).toMatch(/<\/span><\/div><svg\b[^>]*aria-hidden="true"[^>]*>[\s\S]*<\/svg>$/);
  });
});
