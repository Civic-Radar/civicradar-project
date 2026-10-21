import { getAuthenticatedUser, getToken } from '../../../lib/residentAuth';

const LOAD_ERROR = 'Your matching meetings could not be loaded. Please try again.';

// The resident is taken from the verified token only, so a request cannot ask
// for another resident's matches.
export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { data, error } = await supabase!.rpc('match_meetings_for_user', { p_user_id: user.id });
  if (error) return Response.json({ error: LOAD_ERROR }, { status: 500 });

  return Response.json({ meetings: data ?? [] }, { status: 200 });
}
