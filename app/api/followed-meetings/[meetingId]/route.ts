import { ensureUserAccount, getAuthenticatedUser, getToken, type SupabaseClient } from '../../../../lib/residentAuth';

// Always read the current rows; never serve a build-time snapshot.
export const dynamic = 'force-dynamic';

const FOLLOW_ERROR = 'This meeting could not be followed. Please try again.';
const LOAD_ERROR = 'Whether you follow this meeting could not be loaded. Please try again.';
const UNFOLLOW_ERROR = 'This meeting could not be unfollowed. Please try again.';

function parseMeetingId(value: string): number | null {
  const id = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Returns null when the lookup itself fails.
async function meetingExists(supabase: SupabaseClient, meetingId: number): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('meetings')
    .select('meeting_id')
    .eq('meeting_id', meetingId)
    .maybeSingle();
  return error ? null : data !== null;
}

// Reports whether the signed-in resident follows one meeting (SRS-404.1).
// Read-only: it never creates the account row or a follow.
export async function GET(request: Request, { params }: { params: { meetingId: string } }) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const meetingId = parseMeetingId(params.meetingId);
  if (meetingId === null) return Response.json({ error: 'Invalid meeting id.' }, { status: 400 });

  const exists = await meetingExists(supabase!, meetingId);
  if (exists === null) return Response.json({ error: LOAD_ERROR }, { status: 500 });
  if (!exists) return Response.json({ error: 'Meeting not found.' }, { status: 404 });

  const { data: follow, error: followError } = await supabase!
    .from('user_followed_meetings')
    .select('meeting_id')
    .eq('user_id', user.id)
    .eq('meeting_id', meetingId)
    .maybeSingle();
  if (followError) return Response.json({ error: LOAD_ERROR }, { status: 500 });

  return Response.json({ meeting_id: meetingId, followed: follow !== null }, { status: 200 });
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

  const exists = await meetingExists(supabase!, meetingId);
  if (exists === null) return Response.json({ error: FOLLOW_ERROR }, { status: 500 });
  if (!exists) return Response.json({ error: 'Meeting not found.' }, { status: 404 });

  if (!(await ensureUserAccount(supabase!, user))) return Response.json({ error: FOLLOW_ERROR }, { status: 500 });

  // The (user_id, meeting_id) primary key keeps one row per pair; an existing
  // follow is left as it is.
  const { error: followError } = await supabase!
    .from('user_followed_meetings')
    .upsert({ user_id: user.id, meeting_id: meetingId }, { onConflict: 'user_id,meeting_id', ignoreDuplicates: true });
  if (followError) return Response.json({ error: FOLLOW_ERROR }, { status: 500 });

  return Response.json({ meeting_id: meetingId, followed: true }, { status: 200 });
}

// Unfollows one meeting for the signed-in resident (SRS-404.2). Only that
// resident's row for the meeting is removed; unfollowing a meeting that is not
// followed (or does not exist) removes nothing and still succeeds.
export async function DELETE(request: Request, { params }: { params: { meetingId: string } }) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const meetingId = parseMeetingId(params.meetingId);
  if (meetingId === null) return Response.json({ error: 'Invalid meeting id.' }, { status: 400 });

  const { error } = await supabase!
    .from('user_followed_meetings')
    .delete()
    .eq('user_id', user.id)
    .eq('meeting_id', meetingId);
  if (error) return Response.json({ error: UNFOLLOW_ERROR }, { status: 500 });

  return Response.json({ meeting_id: meetingId, followed: false }, { status: 200 });
}
