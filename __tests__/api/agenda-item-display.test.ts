// Tests for SRS-502.6, YA, Agenda item display.
//
// SRS-502.6 acceptance: Given Town A's source provides agenda items and a Town A
// meeting has 5 agenda items, When that meeting's details page opens, Then all 5
// agenda items are listed.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

let towns: Row[] = [];
let agendaItems: Row[] = [];
const queried: string[] = [];

const MEETINGS: Row[] = [
  { meeting_id: 10, town_id: 1, body_id: null, title: 'Town A School Committee', source_body_name: 'School Committee', source_start_time: null, start_at: null, location: null, online_link: null, source_url: null },
  { meeting_id: 20, town_id: 2, body_id: null, title: 'Town B Select Board', source_body_name: 'Select Board', source_start_time: null, start_at: null, location: null, online_link: null, source_url: null },
];

// A small query builder: eq/is narrow the rows, order sorts them, and the
// builder resolves to { data, error } when awaited or through maybeSingle().
function query(table: string, rows: Row[]) {
  let result = [...rows];
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      result = result.filter((row) => row[column] === value);
      return builder;
    },
    is: (column: string, value: unknown) => {
      result = result.filter((row) => (row[column] ?? null) === value);
      return builder;
    },
    order: (column: string, { ascending }: { ascending: boolean }) => {
      result.sort((a, b) => ((a[column] as number) - (b[column] as number)) * (ascending ? 1 : -1));
      return builder;
    },
    maybeSingle: async () => ({ data: result[0] ?? null, error: null }),
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) => {
      queried.push(table);
      return resolve({ data: result, error: null });
    },
  };
  return builder;
}

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    from: (table: string) => {
      const rows: Record<string, Row[]> = { meetings: MEETINGS, towns, documents: [], agenda_items: agendaItems };
      if (!(table in rows)) throw new Error(`Unexpected table: ${table}`);
      return query(table, rows[table]);
    },
  })),
}));

import { GET } from '../../app/api/meetings/[id]/route';

async function getMeeting(id: number) {
  const response = await GET(new Request(`http://localhost/api/meetings/${id}`), { params: { id: String(id) } });
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  queried.length = 0;
  towns = [
    { town_id: 1, name: 'Town A', meeting_time_zone: 'America/New_York', provides_agenda_items: true, provides_recordings: false },
    { town_id: 2, name: 'Town B', meeting_time_zone: 'America/New_York', provides_agenda_items: false, provides_recordings: false },
  ];
  // Stored out of order on purpose; the agenda order is sort_order.
  agendaItems = [
    { agenda_item_id: 105, meeting_id: 10, sort_order: 4, title: 'Adjournment', item_text: null, removed_at: null },
    { agenda_item_id: 101, meeting_id: 10, sort_order: 0, title: 'Call to order', item_text: null, removed_at: null },
    { agenda_item_id: 103, meeting_id: 10, sort_order: 2, title: 'School budget', item_text: 'Review of the FY27 school budget.', removed_at: null },
    { agenda_item_id: 102, meeting_id: 10, sort_order: 1, title: 'Minutes', item_text: null, removed_at: null },
    { agenda_item_id: 104, meeting_id: 10, sort_order: 3, title: 'Public comment', item_text: null, removed_at: null },
    { agenda_item_id: 106, meeting_id: 10, sort_order: 5, title: 'Item the source no longer lists', item_text: null, removed_at: '2026-10-01T00:00:00Z' },
    { agenda_item_id: 201, meeting_id: 20, sort_order: 0, title: 'Other meeting item', item_text: null, removed_at: null },
  ];
});

describe('Agenda item display (SRS-502.6)', () => {
  it("returns all 5 of a Town A meeting's agenda items, in agenda order", async () => {
    const { status, body } = await getMeeting(10);

    expect(status).toBe(200);
    expect(body.agenda_items.map((item: { title: string }) => item.title)).toEqual([
      'Call to order',
      'Minutes',
      'School budget',
      'Public comment',
      'Adjournment',
    ]);
  });

  it('includes each item’s text, so searched words can be found on the page', async () => {
    const { body } = await getMeeting(10);
    const budget = body.agenda_items.find((item: { agenda_item_id: number }) => item.agenda_item_id === 103);

    expect(budget.item_text).toBe('Review of the FY27 school budget.');
  });

  it('leaves out items the source no longer lists and items from other meetings', async () => {
    const { body } = await getMeeting(10);
    const ids = body.agenda_items.map((item: { agenda_item_id: number }) => item.agenda_item_id);

    expect(ids).not.toContain(106);
    expect(ids).not.toContain(201);
  });

  it("returns no agenda items, and doesn't read them, when the town's source doesn't provide them (SRS-502.8)", async () => {
    const { body } = await getMeeting(20);

    expect(body.meeting.provides_agenda_items).toBe(false);
    expect(body.agenda_items).toEqual([]);
    expect(queried).not.toContain('agenda_items');
  });
});
