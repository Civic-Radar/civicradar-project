import { getAuthenticatedUser, getToken } from '../../../lib/residentAuth';

const LOAD_ERROR = 'Your matching meetings could not be loaded. Please try again.';

// The resident is taken from the verified token only, so a request cannot ask
// for another resident's matches. Each meeting comes with why it matched: its
// town, the followed topic tags with their agenda text, and followed_directly.
// The result is Incomplete, with failed_towns listing each followed town whose
// most recent check was not successful (SRS-401.11), and Complete otherwise.
// When the check status can't be read the whole request fails, so a result is
// never called Complete without knowing.
export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { data, error } = await supabase!.rpc('match_meetings_with_reasons',{ p_user_id: user.id });
  if (error) return Response.json({ error: LOAD_ERROR }, { status: 500 });

  const { data: failedTowns, error: checkError } = await supabase!.rpc('unsuccessful_check_towns', { p_user_id: user.id });
  if (checkError) return Response.json({ error: LOAD_ERROR }, { status: 500 });

  const failed_towns = failedTowns ?? [];
  const status = failed_towns.length > 0 ? 'Incomplete' : 'Complete';

  return Response.json({ meetings: data ?? [], status, failed_towns }, { status: 200 });
}
