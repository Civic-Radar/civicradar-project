import { getSupabaseClient } from '../../../../lib/supabase';

// Always read the current row; never serve a build-time snapshot.
export const dynamic = 'force-dynamic';

// Returns one stored meeting with its town and governing body names
// (SRS-502.2, SRS-502.3, SRS-502.9).
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
      'meeting_id, town_id, body_id, title, source_body_name, source_start_time, start_at, location, online_link, source_url',
    )
    .eq('meeting_id', meetingId)
    .maybeSingle();

  if (meetingError) {
    return Response.json({ error: `Could not read the meeting: ${meetingError.message}` }, { status: 500 });
  }
  if (!meeting) {
    return Response.json({ error: 'Meeting not found.' }, { status: 404 });
  }

  const { data: town, error: townError } = await supabase
    .from('towns')
    .select('name, meeting_time_zone')
    .eq('town_id', meeting.town_id)
    .maybeSingle();

  if (townError) {
    return Response.json({ error: `Could not read the town: ${townError.message}` }, { status: 500 });
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
      return Response.json({ error: `Could not read the governing body: ${bodyError.message}` }, { status: 500 });
    }
    bodyName = body?.name ?? null;
  }

  return Response.json(
    {
      meeting: {
        ...meeting,
        town_name: town?.name ?? null,
        meeting_time_zone: town?.meeting_time_zone ?? null,
        body_name: bodyName,
      },
    },
    { status: 200 },
  );
}
