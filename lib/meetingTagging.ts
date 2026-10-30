import type { SupabaseClient } from './residentAuth';
import { tagAgendaText, type AgendaItemText, type CatalogTopic, type TopicTag } from './topicTagger';

export type ClassifyResult =
  | { status: 'classified'; tags: TopicTag[] } // tags may be empty: text exists but matches nothing
  | { status: 'no_agenda_text' } // marked Unavailable; any old tags were removed
  | { status: 'meeting_not_found' }
  | { status: 'agenda_changed' } // the agenda changed after it was read; nothing saved
  | { status: 'error' }; // a read or write failed; database text is never returned

// Tags one meeting from its agenda text and saves the result (SRS-401.4).
// The caller decides who may run it and must pass the service-role client:
// these tables have Row Level Security with no policies.
export async function classifyMeetingTopics(supabase: SupabaseClient, meetingId: number): Promise<ClassifyResult> {
  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select('meeting_id')
    .eq('meeting_id', meetingId)
    .maybeSingle();
  if (meetingError) return { status: 'error' };
  if (!meeting) return { status: 'meeting_not_found' };

  const { data: items, error: itemsError } = await supabase
    .from('agenda_items')
    .select('agenda_item_id, item_text')
    .eq('meeting_id', meetingId)
    .is('removed_at', null)
    .order('sort_order')
    .order('agenda_item_id');
  if (itemsError) return { status: 'error' };

  const agendaItems = (items ?? []) as AgendaItemText[];
  // No agenda text: mark the meeting Unavailable rather than record a false
  // non-match (SRS-401.10), but only if the agenda read above is still the
  // meeting's current agenda (public.mark_meeting_unavailable in
  // supabase/schema.sql).
  if (!agendaItems.some((item) => item.item_text !== null && item.item_text.trim() !== '')) {
    const { data: marked, error: markError } = await supabase.rpc('mark_meeting_unavailable', {
      p_meeting_id: meetingId,
      p_agenda: agendaItems.map(({ agenda_item_id, item_text }) => ({ agenda_item_id, item_text })),
    });
    if (markError) return { status: 'error' };
    if (marked === false) return { status: 'agenda_changed' };
    if (marked !== true) return { status: 'error' };

    return { status: 'no_agenda_text' };
  }

  const { data: topics, error: topicsError } = await supabase
    .from('topics')
    .select('topic_id, name')
    .is('removed_at', null)
    .order('topic_id');
  if (topicsError) return { status: 'error' };

  const tags = tagAgendaText(agendaItems, (topics ?? []) as CatalogTopic[]);

  // One transaction: replaces the meeting's tags and marks it Classified, but
  // only if the agenda read above is still the meeting's current agenda
  // (public.replace_meeting_topics in supabase/schema.sql).
  const { data: saved, error: saveError } = await supabase.rpc('replace_meeting_topics', {
    p_meeting_id: meetingId,
    p_tags: tags.map(({ topic_id, evidence_text }) => ({ topic_id, evidence_text })),
    p_agenda: agendaItems.map(({ agenda_item_id, item_text }) => ({ agenda_item_id, item_text })),
  });
  if (saveError) return { status: 'error' };
  if (saved === false) return { status: 'agenda_changed' };
  if (saved !== true) return { status: 'error' };

  return { status: 'classified', tags };
}
