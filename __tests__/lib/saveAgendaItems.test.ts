// Tests for issue #508 (SRS-401.4): when a check reads a meeting's agenda, the
// items the source no longer lists are marked removed (removed_at), and an item
// listed again is no longer removed. The agenda_items_mark_for_tagging trigger
// then sends the meeting back to topic tagging, so its tags follow the agenda.
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { saveAgendaItems } from '../../lib/retrieval/saveAgendaItems';
import type { SourceAgendaItem } from '../../lib/sources/types';

type Row = { agenda_item_id: number; meeting_id: number; source_item_id: string; item_text: string | null; removed_at: string | null };

// A fake agenda_items table with the calls saveAgendaItems makes: upsert on
// (meeting_id, source_item_id), select by meeting, and update by id.
function fakeDatabase(options: { failRead?: boolean } = {}) {
  const rows: Row[] = [];
  let nextId = 1;
  const client = {
    from(table: string) {
      if (table !== 'agenda_items') throw new Error(`unexpected table ${table}`);
      return {
        upsert: async (sent: Omit<Row, 'agenda_item_id' | 'removed_at'>[]) => {
          for (const row of sent) {
            const existing = rows.find((r) => r.meeting_id === row.meeting_id && r.source_item_id === row.source_item_id);
            if (existing) Object.assign(existing, row);
            else rows.push({ agenda_item_id: nextId++, removed_at: null, ...row });
          }
          return { data: null, error: null };
        },
        select: () => ({
          eq: async (_column: string, meetingId: number) =>
            options.failRead
              ? { data: null, error: { message: 'read failed' } }
              : { data: rows.filter((r) => r.meeting_id === meetingId).map((r) => ({ ...r })), error: null },
        }),
        update: (values: Partial<Row>) => ({
          in: async (_column: string, ids: number[]) => {
            for (const row of rows) if (ids.includes(row.agenda_item_id)) Object.assign(row, values);
            return { data: null, error: null };
          },
        }),
      };
    },
  };
  return { client: client as unknown as SupabaseClient, rows };
}

const item = (sourceItemId: string, itemText: string, sortOrder = 1): SourceAgendaItem => ({ sourceItemId, sortOrder, title: sourceItemId, itemText });
const removed = (rows: Row[], sourceItemId: string) => rows.find((r) => r.source_item_id === sourceItemId)?.removed_at !== null;

describe('Agenda items removed at the source (#508)', () => {
  it('marks item A removed when the source then lists only item B (the steps in #508)', async () => {
    const db = fakeDatabase();
    await saveAgendaItems(db.client, 7, [item('A', 'Vote on affordable housing.'), item('B', 'Parking changes.', 2)]);
    await saveAgendaItems(db.client, 7, [item('B', 'Parking changes.', 1)]);

    expect(removed(db.rows, 'A')).toBe(true);
    expect(removed(db.rows, 'B')).toBe(false);
  });

  it('clears removed_at when a removed item is listed again', async () => {
    const db = fakeDatabase();
    await saveAgendaItems(db.client, 7, [item('A', 'Housing.'), item('B', 'Parking.', 2)]);
    await saveAgendaItems(db.client, 7, [item('B', 'Parking.')]);
    await saveAgendaItems(db.client, 7, [item('A', 'Housing.'), item('B', 'Parking.', 2)]);

    expect(removed(db.rows, 'A')).toBe(false);
  });

  it('keeps the time an item was first marked removed when it stays missing', async () => {
    const db = fakeDatabase();
    await saveAgendaItems(db.client, 7, [item('A', 'Housing.'), item('B', 'Parking.', 2)]);
    await saveAgendaItems(db.client, 7, [item('B', 'Parking.')]);
    const firstRemoved = db.rows.find((r) => r.source_item_id === 'A')?.removed_at;
    await new Promise((resolve) => setTimeout(resolve, 5));
    await saveAgendaItems(db.client, 7, [item('B', 'Parking.')]);

    expect(db.rows.find((r) => r.source_item_id === 'A')?.removed_at).toBe(firstRemoved);
  });

  it("does not touch another meeting's items", async () => {
    const db = fakeDatabase();
    await saveAgendaItems(db.client, 7, [item('A', 'Housing.')]);
    await saveAgendaItems(db.client, 8, [item('C', 'Zoning.')]);

    expect(removed(db.rows, 'A')).toBe(false);
    expect(removed(db.rows, 'C')).toBe(false);
  });

  it('removes nothing when the source lists no items, so a glitch cannot empty an agenda', async () => {
    const db = fakeDatabase();
    await saveAgendaItems(db.client, 7, [item('A', 'Housing.')]);

    expect(await saveAgendaItems(db.client, 7, [])).toBe(0);
    expect(removed(db.rows, 'A')).toBe(false);
  });

  it('still returns the number of items sent', async () => {
    const db = fakeDatabase();

    expect(await saveAgendaItems(db.client, 7, [item('A', 'Housing.'), item('B', 'Parking.', 2)])).toBe(2);
  });

  it('throws when the saved items cannot be read back, so the caller counts the meeting as failed', async () => {
    const db = fakeDatabase({ failRead: true });

    await expect(saveAgendaItems(db.client, 7, [item('A', 'Housing.')])).rejects.toThrow('Could not read agenda items');
  });
});
