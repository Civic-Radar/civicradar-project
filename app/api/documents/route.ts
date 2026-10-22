import { getAuthenticatedUser, getToken } from '../../../lib/residentAuth';

// Always read the current rows; never serve a build-time snapshot.
export const dynamic = 'force-dynamic';

const LOAD_ERROR = 'Documents could not be loaded. Please try again.';

// Lists the documents from the signed-in resident's followed towns (SRS-201.1).
// Placeholder order until SRS-209.1: newest retrieved_at, then newest document_id.
export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { data: follows, error: followsError } = await supabase!
    .from('user_followed_towns')
    .select('town_id')
    .eq('user_id', user.id);

  if (followsError) return Response.json({ error: LOAD_ERROR }, { status: 500 });

  const townIds = ((follows ?? []) as { town_id: number }[]).map((row) => row.town_id);
  if (townIds.length === 0) return Response.json({ documents: [] }, { status: 200 });

  const { data: documents, error } = await supabase!
    .from('documents')
    .select('document_id, title, town_id, meeting_id, retrieved_at')
    .in('town_id', townIds)
    .order('retrieved_at', { ascending: false })
    .order('document_id', { ascending: false });

  if (error) return Response.json({ error: LOAD_ERROR }, { status: 500 });

  return Response.json({ documents: documents ?? [] }, { status: 200 });
}
