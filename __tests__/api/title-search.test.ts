import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentListEntry, DocumentsState } from '../../app/(app)/documents/useDocuments';
import type { TitleSearch as TitleSearchHook } from '../../app/(app)/documents/useTitleSearch';

// SRS-216.2, MS, Title search within scope: a submitted title search lists only
// the documents in the current scope whose titles contain the term, ignoring
// letter case (defect #501).

type Row = Record<string, string | number | null>;

const db = vi.hoisted(() => ({ follows: [] as Row[], documents: [] as Row[], towns: [] as Row[], meetings: [] as Row[] }));

// A small stand-in for the four tables GET /api/documents reads.
vi.mock('../../lib/supabase', () => {
  function from(table: string) {
    const source: Row[] = ({ user_followed_towns: db.follows, documents: db.documents, towns: db.towns, meetings: db.meetings } as Record<string, Row[]>)[table];
    let columns: string[] = [];
    const filters: ((row: Row) => boolean)[] = [];
    const builder = {
      select(list: string) { columns = list.split(',').map((name) => name.trim()); return builder; },
      eq(column: string, value: unknown) { filters.push((row) => row[column] === value); return builder; },
      in(column: string, values: unknown[]) { filters.push((row) => values.includes(row[column])); return builder; },
      order() { return builder; },
      then(resolve: (value: { data: Row[]; error: null }) => unknown) {
        const rows = source.filter((row) => filters.every((keep) => keep(row)));
        return Promise.resolve({ data: rows.map((row) => Object.fromEntries(columns.map((c) => [c, row[c] ?? null]))), error: null }).then(resolve);
      },
    };
    return builder;
  }
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) }, from };
  return { getSupabaseClient: () => client };
});

const hook = vi.hoisted(() => ({ state: { status: 'loading' } as DocumentsState }));
vi.mock('../../app/(app)/documents/useDocuments', () => ({ useDocuments: () => hook.state }));

// The page's search state is replaced by whatever a test sets.
const search = vi.hoisted(() => ({ state: null as null | TitleSearchHook }));
vi.mock('../../app/(app)/documents/useTitleSearch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/(app)/documents/useTitleSearch')>();
  return { ...actual, useTitleSearch: () => search.state ?? { ...actual.INITIAL_TITLE_SEARCH, type: () => {}, submit: () => {}, clear: () => {} } };
});

import { GET } from '../../app/api/documents/route';
// This file is not about the upcoming and past lists (SRS-209.4), so every document is
// treated as upcoming, in the order the page passes it.
vi.mock('../../lib/meetingTimeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/meetingTimeline')>();
  return { ...actual, splitByMeetingDate: <T>(documents: T[]) => ({ upcoming: documents, past: [] as T[] }) };
});

import DocumentsPage from '../../app/(app)/documents/page';
import TitleSearch from '../../app/(app)/documents/TitleSearch';
import { documentsMatchingTitle } from '../../app/(app)/documents/documentsMatchingTitle';
import { documentsOfType } from '../../app/(app)/documents/documentsOfType';
import { INITIAL_TITLE_SEARCH, titleSearchReducer } from '../../app/(app)/documents/useTitleSearch';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

const TOWN_A = 1;
const TOWN_B = 2;

function entry(id: number, title: string, document_type: DocumentListEntry['document_type'] = 'Agenda'): DocumentListEntry {
  return {
    document_id: id, title, town_id: TOWN_A, meeting_id: 100 + id, retrieved_at: '2026-09-01T12:00:00+00:00',
    summary_status: 'Complete', document_type, town_name: 'Town A', meeting_start_at: '2026-09-01T23:00:00+00:00',
    meeting_time_zone: 'America/New_York',
  };
}

function searchState(submittedTerm: string): TitleSearchHook {
  return { query: submittedTerm, submittedTerm, type: vi.fn(), submit: vi.fn(), clear: vi.fn() };
}

function render(documents: DocumentListEntry[], submittedTerm: string): string {
  vi.stubGlobal('React', React);
  hook.state = { status: 'loaded', documents, followsTowns: true };
  search.state = searchState(submittedTerm);
  return renderToStaticMarkup(React.createElement(DocumentsPage));
}

const listedTitles = (markup: string) =>
  Array.from(markup.matchAll(/<li\b[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/g), ([, title]) => title);

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  for (const rows of [db.follows, db.documents, db.towns, db.meetings]) rows.length = 0;
  search.state = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('documentsMatchingTitle (SRS-216.2)', () => {
  const docs = [entry(1, 'Planning Board Agenda'), entry(2, 'City Council Minutes'), entry(3, 'Zoning Board packet: planning')];

  it('keeps the documents whose titles contain the term, in their order', () => {
    expect(documentsMatchingTitle(docs, 'planning').map((doc) => doc.document_id)).toEqual([1, 3]);
  });

  it('ignores letter case in the term and in the titles', () => {
    expect(documentsMatchingTitle(docs, 'PLANNING').map((doc) => doc.document_id)).toEqual([1, 3]);
    expect(documentsMatchingTitle(docs, 'city council').map((doc) => doc.document_id)).toEqual([2]);
  });

  it('trims the term, and keeps every document for a blank one', () => {
    expect(documentsMatchingTitle(docs, '  minutes  ').map((doc) => doc.document_id)).toEqual([2]);
    expect(documentsMatchingTitle(docs, '   ')).toEqual(docs);
    expect(documentsMatchingTitle(docs, '')).toEqual(docs);
  });

  it('works together with the type filter', () => {
    const mixed = [entry(1, 'Planning Board Agenda', 'Agenda'), entry(2, 'Planning Board Packet', 'Packet')];
    expect(documentsMatchingTitle(documentsOfType(mixed, 'Packet'), 'planning').map((doc) => doc.document_id)).toEqual([2]);
  });
});

describe('Title search within scope: the SRS-216.2 example', () => {
  it('lists only the Town A "Planning Board Agenda" for a user who follows Town A, when both towns have one', async () => {
    db.follows.push({ user_id: 'user-1', town_id: TOWN_A });
    db.towns.push({ town_id: TOWN_A, name: 'Town A', meeting_time_zone: 'America/New_York' }, { town_id: TOWN_B, name: 'Town B', meeting_time_zone: 'America/New_York' });
    db.documents.push(
      { document_id: 1, meeting_id: 11, town_id: TOWN_A, title: 'Planning Board Agenda', retrieved_at: '2026-09-01T12:00:00+00:00', summary_status: 'Complete', document_type: 'Agenda' },
      { document_id: 2, meeting_id: 12, town_id: TOWN_B, title: 'Planning Board Agenda', retrieved_at: '2026-09-01T12:00:00+00:00', summary_status: 'Complete', document_type: 'Agenda' },
      { document_id: 3, meeting_id: 13, town_id: TOWN_A, title: 'City Council Minutes', retrieved_at: '2026-09-01T12:00:00+00:00', summary_status: 'Complete', document_type: 'Minutes' },
    );
    db.meetings.push({ meeting_id: 11, start_at: null }, { meeting_id: 12, start_at: null }, { meeting_id: 13, start_at: null });

    // The page searches the documents the route returned, which are the current scope.
    const response = await GET(new Request('http://localhost/api/documents', { headers: { Authorization: 'Bearer token' } }));
    const { documents } = (await response.json()) as { documents: DocumentListEntry[] };
    const markup = render(documents, 'planning');

    expect(documentsMatchingTitle(documents, 'planning').map((doc) => [doc.document_id, doc.town_id])).toEqual([[1, TOWN_A]]);
    expect(listedTitles(markup)).toEqual(['Planning Board Agenda']);
    expect(markup).not.toContain('Town B');
  });
});

describe('Documents page: a submitted title search (SRS-216.2)', () => {
  const docs = [entry(1, 'Planning Board Agenda'), entry(2, 'City Council Minutes'), entry(3, 'Planning Board Minutes')];

  it('lists only the matching documents', () => {
    expect(listedTitles(render(docs, 'planning'))).toEqual(['Planning Board Agenda', 'Planning Board Minutes']);
  });

  it('ignores letter case', () => {
    expect(listedTitles(render(docs, 'MINUTES'))).toEqual(['City Council Minutes', 'Planning Board Minutes']);
  });

  it('lists every document when no search has been submitted', () => {
    expect(listedTitles(render(docs, ''))).toHaveLength(3);
  });
});

describe('Title search state (SRS-216.2)', () => {
  it('does not filter while typing, only when the search is submitted', () => {
    const typed = titleSearchReducer(INITIAL_TITLE_SEARCH, { type: 'typed', value: '  planning ' });
    expect(typed.submittedTerm).toBe('');

    const submitted = titleSearchReducer(typed, { type: 'submitted' });
    expect(submitted.submittedTerm).toBe('planning');
  });

  it('runs the search when the form is submitted (Enter or the Search button)', () => {
    vi.stubGlobal('React', React);
    const onSubmit = vi.fn();
    const preventDefault = vi.fn();
    const form = TitleSearch({ query: 'planning', onQueryChange: vi.fn(), onSubmit }) as React.ReactElement<{
      onSubmit: (event: { preventDefault: () => void }) => void;
    }>;

    form.props.onSubmit({ preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
