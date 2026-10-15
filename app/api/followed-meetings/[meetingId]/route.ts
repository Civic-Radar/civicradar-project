import { ensureUserAccount, getAuthenticatedUser, getToken } from '../../../../lib/residentAuth';

// Always read the current rows; never serve a build-time snapshot.
export const dynamic = 'force-dynamic';

const FOLLOW_ERROR = 'This meeting could not be followed. Please try again.';

function parseMeetingId(value: string): number | null {
  const id = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Follows one meeting for the signed-in resident (SRS-404.1). Matching is by
// meeting_id only, and repeating the request leaves the same single row.
export async function PUT(request: Request, { params }: { params: { meetingId: string } }) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const meetingId = parseMeetingId(params.meetingId);
  if (meetingId === null) return Response.json({ error: 'Invalid meeting id.' }, { status: 400 });

  const { data: meeting, error: meetingError } = await supabase!
    .from('meetings')
    .select('meeting_id')
    .eq('meeting_id', meetingId)
    .maybeSingle();
  if (meetingError) return Response.json({ error: FOLLOW_ERROR }, { status: 500 });
  if (!meeting) return Response.json({ error: 'Meeting not found.' }, { status: 404 });

  if (!(await ensureUserAccount(supabase!, user))) return Response.json({ error: FOLLOW_ERROR }, { status: 500 });

  // The (user_id, meeting_id) primary key keeps one row per pair; an existing
  // follow is left as it is.
  const { error: followError } = await supabase!
    .from('user_followed_meetings')
    .upsert({ user_id: user.id, meeting_id: meetingId }, { onConflict: 'user_id,meeting_id', ignoreDuplicates: true });
  if (followError) return Response.json({ error: FOLLOW_ERROR }, { status: 500 });

  return Response.json({ meeting_id: meetingId, followed: true }, { status: 200 });
}
