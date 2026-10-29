// SRS-306.1, AO, Extraction status display.
// "The system shall display the extraction's current status (Queued, Processing,
//  Completed, or Failed) while the user views an extraction request."
//
// GET /api/extractions/[id] -> one of the signed-in user's extractions, with its status,
// plus the officials it found once it is Completed (SRS-302.1), and the cause of
// failure in plain words when it Failed for a known cause (SRS-307.2).
//
// SRS-310.2, AO, Ownership check: only the owner gets the extraction.
//   200  the signed-in user's own extraction
//   403  the extraction belongs to someone else (access denied; nothing about it is returned)
//   404  no extraction with that id
import { getSupabaseClient } from '../../../../lib/supabase';
import { ACCESS_DENIED_MESSAGE, failureCauseMessage } from '../../../../lib/extractions';

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
    .maybeSingle();

  if (error) return Response.json({ error: 'Could not load the extraction.' }, { status: 500 });
  if (!extraction) return Response.json({ error: 'Extraction not found.' }, { status: 404 });

  // SRS-310.2: someone else's extraction is denied, with none of its details.
  if (extraction.user_id !== user.id) {
    return Response.json({ error: ACCESS_DENIED_MESSAGE }, { status: 403 });
  }

  // SRS-302.1: a completed extraction also returns the officials it found.
  let officials: unknown[] = [];
  if (extraction.status === 'Completed') {
    const { data, error: officialsError } = await supabase
      .from('extracted_officials')
      .select('extracted_official_id, full_name, title, role, email, phone')
      .eq('extraction_id', extractionId)
      .order('extracted_official_id', { ascending: true });

    if (officialsError) return Response.json({ error: 'Could not load the extracted officials.' }, { status: 500 });
    officials = data ?? [];
  }

  // SRS-307.2: a failed extraction also says why, when the cause is a known one.
  const failure_message = extraction.status === 'Failed' ? failureCauseMessage(extraction.failure_cause) : null;

  return Response.json({ extraction: { ...extraction, failure_message }, officials }, { status: 200 });
}

// SRS-305.4, AO, Permanent deletion.
// "The system shall permanently delete the extraction when the user confirms deletion."
//
// DELETE /api/extractions/[id] removes one of the signed-in user's extractions.
// Its officials (extracted_officials) go with it (on delete cascade), so it can't
// be opened again. The shared officials list (SRS-311) is not affected.
//   200  deleted
//   403  the extraction belongs to someone else (SRS-310.2); nothing is deleted
//   404  no extraction with that id
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
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
    .select('extraction_id, user_id')
    .eq('extraction_id', extractionId)
    .maybeSingle();

  if (error) return Response.json({ error: 'The extraction could not be deleted.' }, { status: 500 });
  if (!extraction) return Response.json({ error: 'Extraction not found.' }, { status: 404 });
  if (extraction.user_id !== user.id) return Response.json({ error: ACCESS_DENIED_MESSAGE }, { status: 403 });

  // The owner check is repeated in the delete itself, so only the owner's row can go.
  const { error: deleteError } = await supabase
    .from('extractions')
    .delete()
    .eq('extraction_id', extractionId)
    .eq('user_id', user.id);

  if (deleteError) return Response.json({ error: 'The extraction could not be deleted.' }, { status: 500 });
  return Response.json({ deleted: true }, { status: 200 });
}
