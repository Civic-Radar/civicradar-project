// SRS-306.1, AO, Extraction status display.
// "The system shall display the extraction's current status (Queued, Processing,
//  Completed, or Failed) while the user views an extraction request."
//
// GET /api/extractions/[id] -> one of the signed-in user's extractions, with its status.
//
// Only the owner's extractions are returned; anything else is "not found".
// (SRS-310.2 will turn that into an explicit access-denied response.)
import { getSupabaseClient } from '../../../../lib/supabase';

// Always read the current row so a status change shows up on the next request.
export const dynamic = 'force-dynamic';

const DETAIL_COLUMNS =
  'extraction_id, user_id, document_id, source_document_title, status, failure_cause, requested_at, completed_at';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const extractionId = Number(params.id);
  if (!/^\d+$/.test(params.id) || !Number.isSafeInteger(extractionId)) {
    return Response.json({ error: 'Invalid extraction id.' }, { status: 400 });
  }

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { data: extraction, error } = await supabase
    .from('extractions')
    .select(DETAIL_COLUMNS)
    .eq('extraction_id', extractionId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return Response.json({ error: 'Could not load the extraction.' }, { status: 500 });
  if (!extraction) return Response.json({ error: 'Extraction not found.' }, { status: 404 });

  return Response.json({ extraction }, { status: 200 });
}
