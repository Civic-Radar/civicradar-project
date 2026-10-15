// Lists the retrieved documents a signed-in user can pick from on the
// extraction page (supports SRS-301.1 / SRS-301.2 / SRS-301.4).
//
// GET /api/extractions/documents
//
// Each document comes with its meeting (title and start time) so the page can
// group documents by meeting. Newest meeting first; within a meeting the
// agenda comes before the packet, then minutes, then anything else.
import { getSupabaseClient } from '../../../../lib/supabase';
import { sortDocuments } from '../../../../lib/extractions';
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

  const { data, error } = await supabase
    .from('documents')
    .select('document_id, title, document_type, mime_type, retrieved_at, meeting:meetings(meeting_id, title, start_at)')
    .limit(MAX_DOCUMENTS);

  if (error) return Response.json({ error: 'Could not load documents.' }, { status: 500 });

  const documents = sortDocuments((data ?? []) as unknown as ExtractableDocument[]);
  return Response.json({ documents }, { status: 200 });
}
