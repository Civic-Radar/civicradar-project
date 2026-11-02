import type { SupabaseClient } from './residentAuth';
import { classifyMeetingTopics } from './meetingTagging';

// At most this many meetings are tagged per scheduled check; the rest stay
// Pending for the next check.
export const TAGGING_BATCH_LIMIT = 200;

export type TaggingCounts = {
  classified: number; // tagged, possibly with no tags (text that matches no topic)
  unavailable: number; // no agenda text yet (SRS-401.10)
  agendaChanged: number; // the agenda changed while tagging; tagged next time
  failed: number; // a read or write failed; tagged next time
};

type Options = { limit?: number; now?: () => Date };

// Reads up to `limit` Pending meeting ids: upcoming meetings first, soonest
// first, so the dashboard's meetings are tagged before older ones.
async function pendingMeetingIds(supabase: SupabaseClient, limit: number, now: Date): Promise<number[] | null> {
  const nowText = now.toISOString();
  const upcoming = await supabase
    .from('meetings')
    .select('meeting_id')
    .eq('topic_classification', 'Pending')
    .gte('start_at', nowText)
    .order('start_at', { ascending: true })
    .order('meeting_id', { ascending: true })
    .limit(limit);
  if (upcoming.error) return null;

  const ids = (upcoming.data ?? []).map((row: { meeting_id: number }) => row.meeting_id);
  if (ids.length >= limit) return ids;

  const rest = await supabase
    .from('meetings')
    .select('meeting_id')
    .eq('topic_classification', 'Pending')
    .or(`start_at.is.null,start_at.lt.${nowText}`)
    .order('start_at', { ascending: false, nullsFirst: false })
    .order('meeting_id', { ascending: true })
    .limit(limit - ids.length);
  if (rest.error) return null;

  return [...ids, ...(rest.data ?? []).map((row: { meeting_id: number }) => row.meeting_id)];
}

// Tags the meetings whose topic classification is Pending (Task 401.4-7). A
// meeting is Pending until it is first tagged and again whenever its agenda
// text changes (the agenda_items_mark_for_tagging trigger in
// supabase/schema.sql), so this tags only new or changed agenda text. Runs
// after the scheduled check. One meeting failing never stops the rest: it
// stays Pending and is tried again next time. Never throws; returns null when
// the Pending meetings could not be read.
export async function tagPendingMeetings(supabase: SupabaseClient, options: Options = {}): Promise<TaggingCounts | null> {
  const limit = options.limit ?? TAGGING_BATCH_LIMIT;
  const now = (options.now ?? (() => new Date()))();

  let ids: number[] | null;
  try {
    ids = await pendingMeetingIds(supabase, limit, now);
  } catch {
    ids = null;
  }
  if (ids === null) {
    console.error('Topic tagging: the Pending meetings could not be read');
    return null;
  }

  const counts: TaggingCounts = { classified: 0, unavailable: 0, agendaChanged: 0, failed: 0 };
  for (const meetingId of ids) {
    let status: string;
    try {
      status = (await classifyMeetingTopics(supabase, meetingId)).status;
    } catch {
      status = 'error';
    }

    if (status === 'classified') counts.classified += 1;
    else if (status === 'no_agenda_text') counts.unavailable += 1;
    else if (status === 'agenda_changed') counts.agendaChanged += 1;
    else {
      counts.failed += 1;
      console.error(`Topic tagging: meeting ${meetingId} was not tagged (${status})`);
    }
  }

  console.log(
    `Topic tagging: ${ids.length} meetings, classified ${counts.classified}, unavailable ${counts.unavailable}, ` +
      `agenda changed ${counts.agendaChanged}, failed ${counts.failed}`,
  );
  return counts;
}
