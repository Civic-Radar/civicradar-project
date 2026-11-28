import { getSupabaseClient } from '../../../../lib/supabase';

// Always read the current row; never serve a build-time snapshot.
export const dynamic = 'force-dynamic';

// Fixed message (#757): the database error is logged, never sent.
const LOAD_ERROR = 'This meeting could not be loaded. Please try again.';

// Returns one stored meeting with its town and governing body names
// (SRS-502.2, SRS-502.3, SRS-502.9), its linked documents (SRS-220.7, SRS-502.4),
// whether the town's source provides agenda items and recordings (SRS-502.8),
// and, when it provides them, the meeting's agenda items in agenda order (SRS-502.6).
// No access control yet: any caller can read stored meetings.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const meetingId = Number(params.id);
  if (!/^\d+$/.test(params.id) || !Number.isSafeInteger(meetingId)) {
    return Response.json({ error: 'Invalid meeting id.' }, { status: 400 });
  }

  // Reads need the service role key (RLS is deny-by-default).
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'The Supabase service role key is not configured.' }, { status: 500 });
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  }

  const { data: meeting, error: meetingError } = await supabase
    .from('meetings')
    .select(
      'meeting_id, town_id, body_id, title, source_body_name, source_start_time, start_at, location, online_link, source_url, unlisted_at',
    )
    .eq('meeting_id', meetingId)
    .maybeSingle();

  if (meetingError) {
    console.error(`Meeting ${meetingId}: could not read the meeting: ${meetingError.message}`);
    return Response.json({ error: LOAD_ERROR }, { status: 500 });
  }
  if (!meeting) {
    return Response.json({ error: 'Meeting not found.' }, { status: 404 });
  }

  const { data: town, error: townError } = await supabase
    .from('towns')
    .select('name, meeting_time_zone, provides_agenda_items, provides_recordings')
    .eq('town_id', meeting.town_id)
    .maybeSingle();

  if (townError) {
    console.error(`Meeting ${meetingId}: could not read the town: ${townError.message}`);
    return Response.json({ error: LOAD_ERROR }, { status: 500 });
  }

  // body_id is NULL when the source body name matched no catalog body.
  let bodyName: string | null = null;
  if (meeting.body_id !== null) {
    const { data: body, error: bodyError } = await supabase
      .from('governing_bodies')
      .select('name')
      .eq('body_id', meeting.body_id)
      .maybeSingle();

    if (bodyError) {
      console.error(`Meeting ${meetingId}: could not read the governing body: ${bodyError.message}`);
      return Response.json({ error: LOAD_ERROR }, { status: 500 });
    }
    bodyName = body?.name ?? null;
  }

  // The documents the source lists under this meeting (SRS-220.7).
  const { data: documents, error: documentsError } = await supabase
    .from('documents')
    .select('document_id, title, document_type, source_url')
    .eq('meeting_id', meeting.meeting_id)
    .order('document_id', { ascending: true });

  if (documentsError) {
    console.error(`Meeting ${meetingId}: could not read the documents: ${documentsError.message}`);
    return Response.json({ error: LOAD_ERROR }, { status: 500 });
  }

  // SRS-502.6: the meeting's agenda items, in the source's order. Items the
  // source no longer lists (removed_at set) are left out. Only read when the
  // town's source provides agenda items; otherwise SRS-502.8's label shows.
  type AgendaItem = { agenda_item_id: number; sort_order: number; title: string; item_text: string | null };
  let agendaItems: AgendaItem[] = [];
  if (town?.provides_agenda_items) {
    const { data: items, error: itemsError } = await supabase
      .from('agenda_items')
      .select('agenda_item_id, sort_order, title, item_text')
      .eq('meeting_id', meeting.meeting_id)
      .is('removed_at', null)
      .order('sort_order', { ascending: true });

    if (itemsError) {
      console.error(`Meeting ${meetingId}: could not read the agenda items: ${itemsError.message}`);
      return Response.json({ error: LOAD_ERROR }, { status: 500 });
    }
    agendaItems = (items ?? []) as AgendaItem[];
  }

  // Defect #498: a meeting the source no longer lists has no working CivicClerk
  // page, so no link is sent for it. The page says it is no longer listed.
  const { unlisted_at: unlistedAt, ...stored } = meeting as typeof meeting & { unlisted_at?: string | null };
  const noLongerListed = Boolean(unlistedAt);

  return Response.json(
    {
      meeting: {
        ...stored,
        source_url: noLongerListed ? null : stored.source_url,
        no_longer_listed: noLongerListed,
        town_name: town?.name ?? null,
        meeting_time_zone: town?.meeting_time_zone ?? null,
        body_name: bodyName,
        // Whether the town's source provides these (SRS-502.8).
        provides_agenda_items: town?.provides_agenda_items ?? false,
        provides_recordings: town?.provides_recordings ?? false,
      },
      documents: documents ?? [],
      agenda_items: agendaItems,
    },
    { status: 200 },
  );
}
