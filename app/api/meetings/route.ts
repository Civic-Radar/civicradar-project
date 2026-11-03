import { getSupabaseClient } from '../../../lib/supabase';

// Always read the current rows; never serve a build-time snapshot.
export const dynamic = 'force-dynamic';

// Returns supported towns and stored meeting details (SRS-220.3).
// No access control yet: any caller can read stored meetings.
export async function GET() {
  // Reads need the service role key (RLS is deny-by-default).
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'The Supabase service role key is not configured.' }, { status: 500 });
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  }

  const { data: towns, error: townsError } = await supabase
    .from('towns')
    .select('town_id, name, meeting_time_zone')
    .is('removed_at', null)
    .order('town_id', { ascending: true });

  if (townsError) {
    return Response.json({ error: `Could not read towns: ${townsError.message}` }, { status: 500 });
  }

  const { data: meetings, error: meetingsError } = await supabase
    .from('meetings')
    .select(
      'meeting_id, town_id, title, source_body_name, source_start_time, start_at, location, online_link, source_url',
    )
    .order('start_at', { ascending: false, nullsFirst: false });

  if (meetingsError) {
    return Response.json({ error: `Could not read meetings: ${meetingsError.message}` }, { status: 500 });
  }

  // Each meeting's linked document count for the Materials column, from one read for all listed meetings.
  const meetingRows = (meetings ?? []) as { meeting_id: number }[];
  const documentCounts = new Map<number, number>();
  if (meetingRows.length > 0) {
    const { data: documents, error: documentsError } = await supabase
      .from('documents')
      .select('meeting_id')
      .in('meeting_id', meetingRows.map((meeting) => meeting.meeting_id));

    if (documentsError) {
      return Response.json({ error: `Could not read documents: ${documentsError.message}` }, { status: 500 });
    }

    for (const { meeting_id } of (documents ?? []) as { meeting_id: number }[]) {
      documentCounts.set(meeting_id, (documentCounts.get(meeting_id) ?? 0) + 1);
    }
  }

  const entries = meetingRows.map((meeting) => ({
    ...meeting,
    document_count: documentCounts.get(meeting.meeting_id) ?? 0,
  }));

  return Response.json({ towns, meetings: entries }, { status: 200 });
}
