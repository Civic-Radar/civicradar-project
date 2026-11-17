// Tests for the search bug fixes:
// #523 (SRS-506.2) the meeting matching every word is never crowded out by the row limit;
// #558 (SRS-506.2) a possessive like "Mayor's" finds the same word in agenda items.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchTerms } from '../../lib/search';

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};

// Applies a PostgREST "or" filter of col.ilike.%term% parts to a row.
function matchesOr(row: Row, filter: string): boolean {
  return filter.split(',').some((part) => {
    const [column, , pattern] = part.split('.');
    const term = pattern.replace(/%/g, '').toLowerCase();
    const value = row[column];
    return typeof value === 'string' && value.toLowerCase().includes(term);
  });
}

// A thenable query builder like PostgREST: each or() narrows the rows (so several
// are ANDed), and limit() keeps the first n rows in stored, unranked order.
function query(table: string) {
  let rows = [...(tables[table] ?? [])];
  const builder = {
    select: () => builder,
    is: (column: string, value: unknown) => { rows = rows.filter((row) => (row[column] ?? null) === value); return builder; },
    or: (filter: string) => { rows = rows.filter((row) => matchesOr(row, filter)); return builder; },
    limit: (n: number) => { rows = rows.slice(0, n); return builder; },
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
  };
  return builder;
}

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-a' } }, error: null })) },
    from: vi.fn((table: string) => query(table)),
  })),
}));

import { GET } from '../../app/api/search/route';

async function search(q: string) {
  const res = await GET(new Request(`http://localhost/api/search?q=${encodeURIComponent(q)}`, { headers: { authorization: 'Bearer t' } }));
  return (await res.json()).results as { key: string; title: string }[];
}

beforeEach(() => {
  tables = { towns: [{ town_id: 1, name: 'Salem', meeting_time_zone: 'America/New_York' }], meetings: [], documents: [], agenda_items: [], officials: [] };
});

describe('Best matches are never crowded out (bug #523)', () => {
  it('finds the one meeting with both words even when 40 meetings with one word come first', async () => {
    tables.meetings = [
      ...Array.from({ length: 40 }, (_, i) => ({ meeting_id: i + 1, town_id: 1, title: `Parking Commission ${i + 1}`, source_body_name: null, location: null, start_at: null })),
      { meeting_id: 99, town_id: 1, title: 'Downtown parking hearing', source_body_name: null, location: null, start_at: null },
    ];

    const results = await search('parking downtown');

    expect(results[0].key).toBe('meeting-99');
  });

  it('still lists meetings with only one of the words', async () => {
    tables.meetings = [
      { meeting_id: 1, town_id: 1, title: 'Parking Commission', source_body_name: null, location: null, start_at: null },
      { meeting_id: 2, town_id: 1, title: 'Downtown parking hearing', source_body_name: null, location: null, start_at: null },
    ];

    expect((await search('parking downtown')).map((r) => r.key)).toEqual(['meeting-2', 'meeting-1']);
  });

  it('lists a meeting found both ways only once', async () => {
    tables.meetings = [{ meeting_id: 2, town_id: 1, title: 'Downtown parking hearing', source_body_name: null, location: null, start_at: null }];

    expect(await search('parking downtown')).toHaveLength(1);
  });
});

describe('Possessives (bug #558)', () => {
  it('searches "Mayor\'s" as "mayor"', () => {
    expect(searchTerms("Mayor's appointment")).toEqual(['mayor', 'appointment']);
  });

  it('treats a curly apostrophe the same way', () => {
    expect(searchTerms('Council’s vote')).toEqual(['council', 'vote']);
  });

  it('finds agenda items spelled "Mayor\'s", "Mayor’s" and "Mayors"', async () => {
    tables.agenda_items = [
      { agenda_item_id: 21847, meeting_id: 1939, title: "The Mayor's appointment of Gabriel Sanchez", item_text: null, removed_at: null },
      { agenda_item_id: 2, meeting_id: 1939, title: 'The Mayor’s budget message', item_text: null, removed_at: null },
      { agenda_item_id: 3, meeting_id: 1939, title: 'Mayors conference report', item_text: null, removed_at: null },
    ];

    const keys = (await search("Mayor's")).map((r) => r.key);

    expect(keys).toEqual(expect.arrayContaining(['agenda-item-21847', 'agenda-item-2', 'agenda-item-3']));
  });

  it("splits other apostrophes, so O'Brien searches for brien", () => {
    expect(searchTerms("O'Brien")).toEqual(['o', 'brien']);
  });
});
