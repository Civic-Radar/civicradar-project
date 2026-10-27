import type { SupabaseClient } from '@supabase/supabase-js';
import type { SourceAgendaItem } from '../sources/types';

// Saves one meeting's agenda items to agenda_items (SRS-220.9). Upserts on
// (meeting_id, source_item_id) so a repeat run updates instead of adding rows.
// baselined_at and removed_at are never sent, so they stay as they are.
// Returns the number of items sent. Throws on a failed write.
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

  return rows.length;
}
