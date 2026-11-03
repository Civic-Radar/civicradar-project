// Lists the retrieved documents a signed-in user can pick from on the
// extraction page (supports SRS-301.1 / SRS-301.2 / SRS-301.4).
//
// GET /api/extractions/documents
//
// Each document comes with its meeting (title and start time) so the page can
// group documents by meeting. Newest meeting first; within a meeting the
// agenda comes before the packet, then minutes, then anything else.
//
// SRS-301.8, AO, Extractable documents: only documents from the user's followed
// towns whose meeting has already taken place. A user who follows no town gets
// none, as on the Documents page (SRS-201.1); followsAnyTown tells the page why.
import { getSupabaseClient } from '../../../../lib/supabase';
import { hasMeetingTakenPlace, sortDocuments } from '../../../../lib/extractions';
import type { ExtractableDocument } from '../../../../lib/extractions';

// Upper bound on documents sent to the page (Supabase returns at most 1000 rows).
const MAX_DOCUMENTS = 1000;

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { data: follows, error: followsError } = await supabase
    .from('user_followed_towns')
    .select('town_id')
    .eq('user_id', user.id);

  if (followsError) return Response.json({ error: 'Could not load documents.' }, { status: 500 });

  const townIds = ((follows ?? []) as { town_id: number }[]).map((row) => row.town_id);
  if (townIds.length === 0) return Response.json({ documents: [], followsAnyTown: false }, { status: 200 });

  const { data, error } = await supabase
    .from('documents')
    .select('document_id, title, document_type, mime_type, retrieved_at, meeting:meetings(meeting_id, title, start_at)')
    .in('town_id', townIds)
    .limit(MAX_DOCUMENTS);

  if (error) return Response.json({ error: 'Could not load documents.' }, { status: 500 });

  const now = new Date();
  const documents = sortDocuments(
    ((data ?? []) as unknown as ExtractableDocument[]).filter((document) => hasMeetingTakenPlace(document, now)),
  );
  return Response.json({ documents, followsAnyTown: true }, { status: 200 });
}
