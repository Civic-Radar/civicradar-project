import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentListEntry, DocumentsState } from '../../app/(app)/documents/useDocuments';

// SRS-216.1, MS, Title search field: a search field labeled "Search by title"
// is shown above the document list when the Documents page loads.

const hook = vi.hoisted(() => ({ state: { status: 'loading' } as DocumentsState }));
vi.mock('../../app/(app)/documents/useDocuments', () => ({ useDocuments: () => hook.state }));

import DocumentsPage from '../../app/(app)/documents/page';
import TitleSearch, { TITLE_SEARCH_LABEL } from '../../app/(app)/documents/TitleSearch';
import { INITIAL_TITLE_SEARCH, titleSearchReducer } from '../../app/(app)/documents/useTitleSearch';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

function render(state: DocumentsState): string {
  vi.stubGlobal('React', React);
  hook.state = state;
  return renderToStaticMarkup(React.createElement(DocumentsPage));
}

function entry(id: number): DocumentListEntry {
  return {
    document_id: id, title: `Document ${id}`, town_id: 1, meeting_id: 100 + id, retrieved_at: '2026-09-01T12:00:00+00:00',
    summary_status: 'Complete', document_type: 'Agenda', town_name: 'Salem', meeting_start_at: '2026-09-01T23:00:00+00:00',
    meeting_time_zone: 'America/New_York',
  };
}

const searchFields = (markup: string) => Array.from(markup.matchAll(/<input\b[^>]*type="search"[^>]*>/g), ([tag]) => tag);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Documents page: title search field (SRS-216.1)', () => {
  it('uses the exact SRS label', () => {
    expect(TITLE_SEARCH_LABEL).toBe('Search by title');
  });

  it('shows one search field labeled Search by title for a signed-in user', () => {
    const markup = render({ status: 'loaded', documents: [entry(1), entry(2)], followsTowns: true });

    expect(searchFields(markup)).toHaveLength(1);
    // The label wraps the field, so the field's accessible name is the label text.
    expect(markup).toMatch(/<label\b[^>]*><span class="sr-only">Search by title<\/span>[\s\S]*?<input\b[^>]*type="search"/);
    expect(searchFields(markup)[0]).toContain('placeholder="Search by title"');
  });

  it('puts the field above the count and the first list entry', () => {
    const markup = render({ status: 'loaded', documents: [entry(1), entry(2)], followsTowns: true });
    const field = markup.indexOf('type="search"');

    expect(field).toBeGreaterThan(-1);
    expect(field).toBeLessThan(markup.indexOf('2 documents'));
    expect(field).toBeLessThan(markup.indexOf('<li'));
  });

  it('starts empty', () => {
    const markup = render({ status: 'loaded', documents: [entry(1)], followsTowns: true });
    expect(searchFields(markup)[0]).toContain('value=""');
    expect(INITIAL_TITLE_SEARCH.query).toBe('');
  });

  it('is not shown with the setup message, or before the documents load', () => {
    expect(searchFields(render({ status: 'loaded', documents: [], followsTowns: false }))).toHaveLength(0);
    expect(searchFields(render({ status: 'loading' }))).toHaveLength(0);
    expect(searchFields(render({ status: 'signedOut' }))).toHaveLength(0);
  });
});

describe('TitleSearch form (SRS-216.1)', () => {
  it('shows the query it is given and reports typing', () => {
    vi.stubGlobal('React', React);
    const onQueryChange = vi.fn();
    const markup = renderToStaticMarkup(
      React.createElement(TitleSearch, { query: 'planning', onQueryChange, onSubmit: vi.fn() }),
    );
    expect(markup).toContain('value="planning"');
    expect(markup).toContain('role="search"');
  });

  it('keeps what the user types in the field', () => {
    expect(titleSearchReducer(INITIAL_TITLE_SEARCH, { type: 'typed', value: 'plan' }).query).toBe('plan');
  });
});
