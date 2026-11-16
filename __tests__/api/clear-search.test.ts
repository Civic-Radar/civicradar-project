import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentListEntry, DocumentsState } from '../../app/(app)/documents/useDocuments';
import type { TitleSearch as TitleSearchHook, TitleSearchState } from '../../app/(app)/documents/useTitleSearch';

// SRS-216.4, MS, Clear search: clearing the title search field lists every
// document in the current scope again (defect #502).

const hook = vi.hoisted(() => ({ state: { status: 'loading' } as DocumentsState }));
vi.mock('../../app/(app)/documents/useDocuments', () => ({ useDocuments: () => hook.state }));

const search = vi.hoisted(() => ({ state: null as null | TitleSearchHook }));
vi.mock('../../app/(app)/documents/useTitleSearch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/(app)/documents/useTitleSearch')>();
  return { ...actual, useTitleSearch: () => search.state };
});

import DocumentsPage from '../../app/(app)/documents/page';
import TitleSearch, { CLEAR_SEARCH_LABEL } from '../../app/(app)/documents/TitleSearch';
import { INITIAL_TITLE_SEARCH, titleSearchReducer } from '../../app/(app)/documents/useTitleSearch';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

// 30 documents in scope; 2 of them have "Planning" in the title.
const DOCS: DocumentListEntry[] = Array.from({ length: 30 }, (_, index) => {
  const id = index + 1;
  return {
    document_id: id, title: id <= 2 ? `Planning Board Agenda ${id}` : `City Council Agenda ${id}`, town_id: 1, meeting_id: 100 + id,
    retrieved_at: '2026-09-01T12:00:00+00:00', summary_status: 'Complete', document_type: 'Agenda', town_name: 'Salem',
    meeting_start_at: '2026-09-01T23:00:00+00:00', meeting_time_zone: 'America/New_York',
  };
});

function render(state: TitleSearchState, clear = vi.fn()): string {
  vi.stubGlobal('React', React);
  hook.state = { status: 'loaded', documents: DOCS, followsTowns: true };
  search.state = { ...state, type: vi.fn(), submit: vi.fn(), clear };
  return renderToStaticMarkup(React.createElement(DocumentsPage));
}

const listEntries = (markup: string) => Array.from(markup.matchAll(/<li\b/g)).length;

// The search goes through the same steps the user takes in the browser.
function steps(...actions: Parameters<typeof titleSearchReducer>[1][]): TitleSearchState {
  return actions.reduce(titleSearchReducer, INITIAL_TITLE_SEARCH);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Clear search: the SRS-216.4 example', () => {
  it('goes from 2 of 30 documents to all 30 when the user deletes the search text', () => {
    const searching = steps({ type: 'typed', value: 'planning' }, { type: 'submitted' });
    expect(listEntries(render(searching))).toBe(2);

    const cleared = titleSearchReducer(searching, { type: 'typed', value: '' });
    expect(cleared).toEqual({ query: '', submittedTerm: '' });
    expect(listEntries(render(cleared))).toBe(30);
  });

  it('also lists all 30 when the field is left with only spaces', () => {
    const cleared = steps({ type: 'typed', value: 'planning' }, { type: 'submitted' }, { type: 'typed', value: '   ' });
    expect(listEntries(render(cleared))).toBe(30);
  });

  it('goes back to all 30 with the Clear search button', () => {
    const cleared = steps({ type: 'typed', value: 'planning' }, { type: 'submitted' }, { type: 'cleared' });
    expect(cleared).toEqual(INITIAL_TITLE_SEARCH);
    expect(listEntries(render(cleared))).toBe(30);
  });

  it('keeps the search while the user edits the text without emptying it', () => {
    const editing = steps({ type: 'typed', value: 'planning' }, { type: 'submitted' }, { type: 'typed', value: 'plan' });
    expect(editing.submittedTerm).toBe('planning');
    expect(listEntries(render(editing))).toBe(2);
  });
});

describe('Clear search button (SRS-216.4)', () => {
  const buttons = (markup: string) =>
    Array.from(markup.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g), ([, inner]) => inner.replace(/<[^>]*>/g, '').trim());

  it('shows only while a search is active', () => {
    expect(buttons(render(INITIAL_TITLE_SEARCH))).toEqual(['Search']);
    expect(buttons(render({ query: 'planning', submittedTerm: '' }))).toEqual(['Search']);
    expect(buttons(render({ query: 'planning', submittedTerm: 'planning' }))).toEqual(['Search', CLEAR_SEARCH_LABEL]);
    expect(CLEAR_SEARCH_LABEL).toBe('Clear search');
  });

  it('calls the clear handler when selected', () => {
    vi.stubGlobal('React', React);
    const onClear = vi.fn();
    const form = TitleSearch({ query: 'planning', onQueryChange: vi.fn(), onSubmit: vi.fn(), searchActive: true, onClear }) as React.ReactElement<{
      children: React.ReactNode;
    }>;
    const clearButton = React.Children.toArray(form.props.children).find(
      (child): child is React.ReactElement<{ type: string; onClick: () => void }> =>
        React.isValidElement(child) && (child.props as { type?: string }).type === 'button',
    );

    clearButton?.props.onClick();

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
