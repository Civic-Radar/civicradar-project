import type { SupabaseClient } from '@supabase/supabase-js';
import type { ListingWindow } from '../sources/types';

// Defect #498: a meeting the source has since removed kept its "Open on
// CivicClerk" link, which led to a CivicClerk page that never loads.
//
// After a successful check (Definition 10: both listings read in full), any
// stored meeting of the town that starts inside the listing window but was not
// listed is marked with meetings.unlisted_at. The meeting details page then
// says it is no longer listed in place of the dead link. saveMeetings clears
// the mark if a later listing includes the meeting again. A check that is not
// successful never marks anything (SRS-221.3), and the meeting row itself is
// never removed or otherwise changed.

const DAY_MS = 24 * 60 * 60 * 1000;

// The window is narrowed by a day at each end, so a meeting whose stored start
// time sits right on the edge (the source filters on its own time field) is
// never marked by mistake.
function innerWindow(window: ListingWindow): { from: string; to: string } {
  return {
    from: new Date(Date.parse(window.from) + DAY_MS).toISOString(),
    to: new Date(Date.parse(window.to) - DAY_MS).toISOString(),
  };
}

// Marks the town's in-window meetings that the listing left out. Returns how
// many were marked. Never throws: a failure is logged by town and step only,
// and leaves every meeting as it was.
export async function markUnlistedMeetings(
  supabase: SupabaseClient,
  townId: number,
  listedSourceMeetingIds: ReadonlySet<string>,
  window: ListingWindow,
  now: Date,
): Promise<number> {
  try {
    const { from, to } = innerWindow(window);
    const { data, error } = await supabase
      .from('meetings')
      .select('meeting_id, source_meeting_id')
      .eq('town_id', townId)
      .is('unlisted_at', null)
      .gte('start_at', from)
      .lte('start_at', to);

    if (error) {
      console.error(`Unlisted meetings: town ${townId} could not read meetings: ${error.message}`);
      return 0;
    }

    const unlisted = ((data ?? []) as { meeting_id: number; source_meeting_id: string }[])
      .filter((meeting) => !listedSourceMeetingIds.has(meeting.source_meeting_id))
      .map((meeting) => meeting.meeting_id);
    if (unlisted.length === 0) return 0;

    const { error: updateError } = await supabase
      .from('meetings')
      .update({ unlisted_at: now.toISOString() })
      .in('meeting_id', unlisted);

    if (updateError) {
      console.error(`Unlisted meetings: town ${townId} could not mark meetings: ${updateError.message}`);
      return 0;
    }

    console.log(`Unlisted meetings: town ${townId} marked ${unlisted.length} meeting(s) no longer listed by the source`);
    return unlisted.length;
  } catch (error: unknown) {
    console.error(
      `Unlisted meetings: town ${townId} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
    return 0;
  }
}
