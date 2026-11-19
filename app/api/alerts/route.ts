import { getAuthenticatedUser, getToken } from '../../../lib/residentAuth';

const LOAD_ERROR = 'Your alerts could not be loaded. Please try again.';

// SRS-404.3: the signed-in resident's in-app alerts, newest first, each with
// the meeting and what is new. The resident comes from the verified token only,
// so a request can't read another resident's alerts. This route only reads and
// returns; turning a row into what the page shows is lib/alerts.ts.
export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { data, error } = await supabase!.rpc('list_user_alerts', { p_user_id: user.id });
  if (error) return Response.json({ error: LOAD_ERROR }, { status: 500 });

  return Response.json({ alerts: data ?? [] }, { status: 200 });
}
