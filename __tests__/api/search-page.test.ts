// Tests for the search page markup: SRS-506.1 (search field), SRS-507.1 (labels),
// SRS-507.2 (each result links to its page), SRS-507.3 (no results message).
import { createRequire } from 'node:module';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchResult } from '../../lib/search';

// @types/react-dom is not installed, so react-dom/server is loaded with only the one function used here.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

import SearchPage from '../../app/(app)/search/page';
import SearchResults from '../../app/(app)/search/SearchResults';

// The components don't import React; Vitest compiles their JSX to React.createElement.
beforeEach(() => {
  vi.stubGlobal('React', React);
});

const result = (type: SearchResult['type'], key: string, title: string, href: string): SearchResult => ({
  type, key, title, detail: null, href, score: 1,
});

describe('Search input (SRS-506.1)', () => {
  it('shows a search field when the search page opens', () => {
    const markup = renderToStaticMarkup(React.createElement(SearchPage));

    expect(markup).toMatch(/<form[^>]*role="search"/);
    expect(markup).toMatch(/<input[^>]*type="search"/);
    expect(markup).toContain('>Search</button>');
    // Nothing has been searched yet.
    expect(markup).not.toContain('No results found.');
  });
});

describe('Search results (SRS-507.1, SRS-507.2, SRS-507.3)', () => {
  it('labels a meeting and a document, and links each to its page', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SearchResults, {
        results: [
          result('Meeting', 'meeting-1192', 'City Council Regular Meeting', '/meetings/1192'),
          result('Document', 'document-7', 'Agenda Packet', '/documents/7'),
        ],
      }),
    );

    expect(markup).toMatch(/>Meeting<\/span>/);
    expect(markup).toMatch(/>Document<\/span>/);
    expect(markup).toContain('href="/meetings/1192"');
    expect(markup).toContain('href="/documents/7"');
    expect(markup).not.toContain('No results found.');
  });

  it('highlights the searched words and carries them to the opened page', () => {
    const markup = renderToStaticMarkup(
      React.createElement(SearchResults, {
        query: 'school',
        results: [result('Meeting', 'meeting-1200', 'School Committee', '/meetings/1200')],
      }),
    );

    expect(markup).toMatch(/<mark[^>]*>School<\/mark> Committee/);
    expect(markup).toContain('href="/meetings/1200?q=school"');
  });

  it('shows "No results found." when a search returns zero results', () => {
    const markup = renderToStaticMarkup(React.createElement(SearchResults, { results: [] }));

    expect(markup).toContain('No results found.');
    expect(markup).not.toContain('<ul');
  });
});
