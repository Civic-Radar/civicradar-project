// POST /api/extractions/[id]/run — runs one of the signed-in user's Queued
// extractions: reads the document, finds the officials, and saves them (SRS-302.1).
//
// 200 { status: 'Completed' | 'Failed', officialsFound }  the run finished
// 409 { status }                                          it isn't Queued (already running or done)
// 403                                                     another user's extraction (SRS-310.2)
// 404                                                     no extraction with that id
import { getSupabaseClient } from '../../../../../lib/supabase';
import { runExtraction } from '../../../../../lib/extraction/runExtraction';
import { ACCESS_DENIED_MESSAGE } from '../../../../../lib/extractions';

export const dynamic = 'force-dynamic';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
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

  let result;
  try {
    result = await runExtraction(supabase, extractionId, user.id);
  } catch {
    return Response.json({ error: 'The extraction could not be started.' }, { status: 500 });
  }

  if (result.outcome === 'not_found') return Response.json({ error: 'Extraction not found.' }, { status: 404 });
  if (result.outcome === 'denied') return Response.json({ error: ACCESS_DENIED_MESSAGE }, { status: 403 });
  if (result.outcome === 'not_queued') {
    return Response.json({ error: 'This extraction is not waiting to run.', status: result.status }, { status: 409 });
  }
  return Response.json({ status: result.status, officialsFound: result.officialsFound }, { status: 200 });
}
