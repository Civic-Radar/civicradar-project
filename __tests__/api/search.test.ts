// Tests for SRS-506.2, YA, Search submission, and SRS-507.1 / SRS-507.2.
//
// SRS-506.2 acceptance: Given the user enters "parking downtown", When the user
// submits the query, Then a search runs across meetings, documents, agenda items,
// and officials.
// SRS-507.1 acceptance: Given a search returns one meeting and one document,
// When the search completes, Then both results are listed, labeled Meeting and Document.
// SRS-507.2 acceptance: a result for meeting 1192 opens meeting 1192's details page.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

let tables: Record<string, Row[]> = {};
const queried: string[] = [];

// Applies a PostgREST "or" filter of col.ilike.%term% parts to a row.
function matchesOr(row: Row, filter: string): boolean {
  return filter.split(',').some((part) => {
    const [column, , pattern] = part.split('.');
    const term = pattern.replace(/%/g, '').toLowerCase();
    const value = row[column];
    return typeof value === 'string' && value.toLowerCase().includes(term);
  });
}

// A thenable query builder: select/is/or/limit narrow the rows; awaiting it returns them.
function query(table: string) {
  let rows = [...(tables[table] ?? [])];
  const builder = {
    select: () => builder,
    is: (column: string, value: unknown) => {
      rows = rows.filter((row) => (row[column] ?? null) === value);
      return builder;
    },
    or: (filter: string) => {
      rows = rows.filter((row) => matchesOr(row, filter));
      return builder;
    },
    limit: (n: number) => {
      rows = rows.slice(0, n);
      return builder;
    },
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
  };
  return builder;
}

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (token: string) =>
        token === 'valid-token'
          ? { data: { user: { id: 'user-a' } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
      ),
    },
    from: vi.fn((table: string) => {
      queried.push(table);
      return query(table);
    }),
  })),
}));

import { GET } from '../../app/api/search/route';

async function search(q: string | null, token: string | null = 'valid-token') {
  const url = q === null ? 'http://localhost/api/search' : `http://localhost/api/search?q=${encodeURIComponent(q)}`;
  const res = await GET(new Request(url, { headers: token ? { authorization: `Bearer ${token}` } : {} }));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  queried.length = 0;
  tables = {
    towns: [{ town_id: 1, name: 'Salem', meeting_time_zone: 'America/New_York' }],
    meetings: [
      { meeting_id: 1192, town_id: 1, title: 'Traffic and Parking Commission', source_body_name: null, location: 'City Hall', start_at: '2026-09-24T23:00:00Z' },
      { meeting_id: 1200, town_id: 1, title: 'School Committee', source_body_name: null, location: null, start_at: null },
    ],
    documents: [
      { document_id: 7, title: 'Downtown parking study', document_type: 'Packet', summary_text: null },
      { document_id: 8, title: 'Budget hearing agenda', document_type: 'Agenda', summary_text: 'The FY27 school budget.' },
    ],
    agenda_items: [
      { agenda_item_id: 3, meeting_id: 1192, title: 'Resident parking permits downtown', item_text: null, removed_at: null },
      { agenda_item_id: 4, meeting_id: 1192, title: 'Parking item that was removed', item_text: null, removed_at: '2026-10-01T00:00:00Z' },
    ],
    officials: [
      { official_id: 5, full_name: 'Ann Lee', title: 'Parking Director', role: null },
      { official_id: 6, full_name: 'Bo Kim', title: 'City Clerk', role: null },
    ],
  };
});

describe('Search submission (SRS-506.2)', () => {
  it('runs a search across meetings, documents, agenda items, and officials for "parking downtown"', async () => {
    const { status, body } = await search('parking downtown');

    expect(status).toBe(200);
    expect(queried).toEqual(expect.arrayContaining(['meetings', 'documents', 'agenda_items', 'officials']));
    expect(body.results.map((r: { type: string }) => r.type).sort()).toEqual(['Agenda item', 'Document', 'Meeting', 'Official']);
  });

  it('ranks results that match more of the words first', async () => {
    const { body } = await search('parking downtown');

    // The study and the agenda item contain both words; the others contain one.
    expect(body.results.slice(0, 2).map((r: { title: string }) => r.title).sort()).toEqual([
      'Downtown parking study',
      'Resident parking permits downtown',
    ]);
  });

  it('leaves out agenda items the source no longer lists', async () => {
    const { body } = await search('removed');
    expect(body.results).toEqual([]);
  });

  it('also finds a document by the words in its summary', async () => {
    const { body } = await search('school budget');
    expect(body.results.map((r: { key: string }) => r.key)).toEqual(expect.arrayContaining(['document-8', 'meeting-1200']));
  });
});

describe('Empty search prevention (SRS-506.3)', () => {
  it.each(['', '   '])('does not run a search for %j', async (q) => {
    const { status } = await search(q);
    expect(status).toBe(400);
    expect(queried).toEqual([]);
  });

  it('does not run a search when there is no query at all', async () => {
    const { status } = await search(null);
    expect(status).toBe(400);
    expect(queried).toEqual([]);
  });
});

describe('Search results display and selection (SRS-507.1, SRS-507.2)', () => {
  it('lists one meeting and one document, labeled Meeting and Document', async () => {
    tables.agenda_items = [];
    tables.officials = [];
    tables.documents = [tables.documents[0]];

    const { body } = await search('parking');

    expect(body.results.map((r: { type: string; title: string }) => [r.type, r.title])).toEqual([
      ['Meeting', 'Traffic and Parking Commission'],
      ['Document', 'Downtown parking study'],
    ]);
  });

  it("links meeting 1192 to its details page and each other kind to its page", async () => {
    const { body } = await search('parking downtown');
    const hrefs = Object.fromEntries(body.results.map((r: { key: string; href: string }) => [r.key, r.href]));

    expect(hrefs['meeting-1192']).toBe('/meetings/1192');
    expect(hrefs['document-7']).toBe('/documents/7');
    expect(hrefs['agenda-item-3']).toBe('/meetings/1192');
    expect(hrefs['official-5']).toBe('/officials');
  });

  it("shows the meeting's town and local date", async () => {
    const { body } = await search('commission');
    expect(body.results[0].detail).toBe('Salem · Sep 24, 2026');
  });

  it('returns an empty list when nothing matches', async () => {
    const { status, body } = await search('snow removal');
    expect(status).toBe(200);
    expect(body.results).toEqual([]);
  });
});

describe('Access', () => {
  it('requires a signed-in user', async () => {
    expect((await search('parking', null)).status).toBe(401);
    expect((await search('parking', 'bad-token')).status).toBe(401);
    expect(queried).toEqual([]);
  });
});
