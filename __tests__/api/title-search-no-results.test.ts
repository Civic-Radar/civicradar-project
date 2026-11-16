import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentListEntry, DocumentsState } from '../../app/(app)/documents/useDocuments';
import type { TitleSearch as TitleSearchHook } from '../../app/(app)/documents/useTitleSearch';

// SRS-216.3, MS, No results message: "No documents match your search." is shown
// when a submitted title search matches zero documents.

const hook = vi.hoisted(() => ({ state: { status: 'loading' } as DocumentsState }));
vi.mock('../../app/(app)/documents/useDocuments', () => ({ useDocuments: () => hook.state }));

const search = vi.hoisted(() => ({ state: null as null | TitleSearchHook }));
vi.mock('../../app/(app)/documents/useTitleSearch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/(app)/documents/useTitleSearch')>();
  return { ...actual, useTitleSearch: () => search.state };
});

import DocumentsPage from '../../app/(app)/documents/page';
import { EMPTY_LIST_MESSAGE, NO_RESULTS_MESSAGE } from '../../app/(app)/documents/documentsMessages';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

function entry(id: number, title: string): DocumentListEntry {
  return {
    document_id: id, title, town_id: 1, meeting_id: 100 + id, retrieved_at: '2026-09-01T12:00:00+00:00',
    summary_status: 'Complete', document_type: 'Agenda', town_name: 'Salem', meeting_start_at: '2026-09-01T23:00:00+00:00',
    meeting_time_zone: 'America/New_York',
  };
}

const DOCS = [entry(1, 'Planning Board Agenda'), entry(2, 'City Council Minutes')];

function render(documents: DocumentListEntry[], query: string, submittedTerm: string): string {
  vi.stubGlobal('React', React);
  hook.state = { status: 'loaded', documents, followsTowns: true };
  search.state = { query, submittedTerm, type: vi.fn(), submit: vi.fn(), clear: vi.fn() };
  return renderToStaticMarkup(React.createElement(DocumentsPage));
}

const textOf = (markup: string) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const listEntries = (markup: string) => Array.from(markup.matchAll(/<li\b/g)).length;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Documents page: no-results message (SRS-216.3)', () => {
  it('has the exact SRS text', () => {
    expect(NO_RESULTS_MESSAGE).toBe('No documents match your search.');
  });

  it('shows the message and no list entries when the search "zoning" matches no title', () => {
    const markup = render(DOCS, 'zoning', 'zoning');

    expect(textOf(markup)).toContain(NO_RESULTS_MESSAGE);
    expect(listEntries(markup)).toBe(0);
  });

  it('does not show it when the search matches a document', () => {
    const markup = render(DOCS, 'planning', 'planning');

    expect(textOf(markup)).not.toContain(NO_RESULTS_MESSAGE);
    expect(listEntries(markup)).toBe(1);
  });

  it('does not show it before a search is submitted, even with text typed in the field', () => {
    const markup = render(DOCS, 'zoning', '');

    expect(textOf(markup)).not.toContain(NO_RESULTS_MESSAGE);
    expect(listEntries(markup)).toBe(2);
  });

  it('shows the empty-list message, not this one, when the scope itself has no documents', () => {
    const text = textOf(render([], 'zoning', 'zoning'));

    expect(text).toContain(EMPTY_LIST_MESSAGE);
    expect(text).not.toContain(NO_RESULTS_MESSAGE);
  });
});
