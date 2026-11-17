import type { SupabaseClient } from '@supabase/supabase-js';
import type { SourceAgendaItem } from '../sources/types';

// Saves one meeting's agenda items to agenda_items (SRS-220.9). Upserts on
// (meeting_id, source_item_id) so a repeat run updates instead of adding rows.
// baselined_at and removed_at are never sent, so they stay as they are.
// Then (issue #508, SRS-401.4) it sets removed_at on the meeting's saved items
// the source no longer lists, and clears it on any listed again. The
// agenda_items_mark_for_tagging trigger sends the meeting back to topic
// tagging when that happens. Pages and search already leave out removed items.
// An empty list changes nothing: it is not taken to mean every item was
// removed, so one bad read cannot empty a meeting's agenda.
// Returns the number of items sent. Throws on a failed write or read.
export async function saveAgendaItems(
  supabase: SupabaseClient,
  meetingId: number,
  items: SourceAgendaItem[],
): Promise<number> {
  if (items.length === 0) {
    return 0;
  }

  const rows = items.map((item) => ({
    meeting_id: meetingId,
    source_item_id: item.sourceItemId,
    sort_order: item.sortOrder,
    title: item.title,
    item_text: item.itemText,
  }));

  const { error } = await supabase.from('agenda_items').upsert(rows, { onConflict: 'meeting_id,source_item_id' });

  if (error) {
    throw new Error(`Could not save agenda items: ${error.message}`);
  }

  await markRemovedItems(supabase, meetingId, new Set(items.map((item) => item.sourceItemId)));

  return rows.length;
}

// Sets removed_at on the meeting's items that are not in `listed` and clears it
// on the ones that are. An item already marked keeps the time it was first
// found missing.
async function markRemovedItems(supabase: SupabaseClient, meetingId: number, listed: Set<string>): Promise<void> {
  const { data, error } = await supabase
    .from('agenda_items')
    .select('agenda_item_id, source_item_id, removed_at')
    .eq('meeting_id', meetingId);

  if (error) {
    throw new Error(`Could not read agenda items: ${error.message}`);
  }

  const saved = (data ?? []) as { agenda_item_id: number; source_item_id: string; removed_at: string | null }[];
  const nowMissing = saved.filter((row) => !listed.has(row.source_item_id) && row.removed_at === null);
  const back = saved.filter((row) => listed.has(row.source_item_id) && row.removed_at !== null);

  for (const [ids, removedAt] of [
    [nowMissing.map((row) => row.agenda_item_id), new Date().toISOString()],
    [back.map((row) => row.agenda_item_id), null],
  ] as const) {
    if (ids.length === 0) continue;
    const { error: updateError } = await supabase.from('agenda_items').update({ removed_at: removedAt }).in('agenda_item_id', ids);
    if (updateError) {
      throw new Error(`Could not mark removed agenda items: ${updateError.message}`);
    }
  }
}
