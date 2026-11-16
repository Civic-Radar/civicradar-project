import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentListEntry, DocumentsState } from '../../app/(app)/documents/useDocuments';

// SRS-201.2, MS, Empty list message: a user who follows at least one town whose
// scope has zero documents sees "No documents have been retrieved for the towns
// you follow yet." and no list entries (defect #524).

const hook = vi.hoisted(() => ({ state: { status: 'loading' } as DocumentsState }));
vi.mock('../../app/(app)/documents/useDocuments', () => ({ useDocuments: () => hook.state }));

import DocumentsPage from '../../app/(app)/documents/page';
import { EMPTY_LIST_MESSAGE, SETUP_MESSAGE } from '../../app/(app)/documents/documentsMessages';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

function render(state: DocumentsState): string {
  vi.stubGlobal('React', React);
  hook.state = state;
  return renderToStaticMarkup(React.createElement(DocumentsPage));
}

const textOf = (markup: string) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const listEntries = (markup: string) => Array.from(markup.matchAll(/<li\b/g)).length;

function entry(id: number, document_type: DocumentListEntry['document_type'] = 'Agenda'): DocumentListEntry {
  return {
    document_id: id, title: `Document ${id}`, town_id: 1, meeting_id: 100 + id, retrieved_at: '2026-09-01T12:00:00+00:00',
    summary_status: 'Complete', document_type, town_name: 'Salem', meeting_start_at: '2026-09-01T23:00:00+00:00',
    meeting_time_zone: 'America/New_York',
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Documents page: empty-list message (SRS-201.2)', () => {
  it('has the exact SRS text', () => {
    expect(EMPTY_LIST_MESSAGE).toBe('No documents have been retrieved for the towns you follow yet.');
  });

  it('shows the message and no list entries when the user follows a town with zero documents', () => {
    const markup = render({ status: 'loaded', documents: [], followsTowns: true });

    expect(textOf(markup)).toContain(EMPTY_LIST_MESSAGE);
    expect(listEntries(markup)).toBe(0);
  });

  it('shows the setup message instead when the user follows no towns', () => {
    const text = textOf(render({ status: 'loaded', documents: [], followsTowns: false }));

    expect(text).toContain(SETUP_MESSAGE);
    expect(text).not.toContain(EMPTY_LIST_MESSAGE);
  });

  it('does not show the message when the followed towns have documents', () => {
    const markup = render({ status: 'loaded', documents: [entry(1), entry(2)], followsTowns: true });

    expect(textOf(markup)).not.toContain(EMPTY_LIST_MESSAGE);
    expect(listEntries(markup)).toBe(2);
  });

  it('is not shown while loading, signed out or after a failed load', () => {
    for (const state of [{ status: 'loading' }, { status: 'signedOut' }, { status: 'loadFailed' }] as DocumentsState[]) {
      expect(textOf(render(state))).not.toContain(EMPTY_LIST_MESSAGE);
    }
  });
});
