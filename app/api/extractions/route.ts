// SRS-301.4, AO, Extraction request.
// "The system shall create one extraction request linked to the signed-in user
//  when the user confirms extraction of the selected document."
//
// POST /api/extractions   { document_id }  -> creates one Queued extraction
// GET  /api/extractions                    -> lists the signed-in user's extractions
//
// Also covers SRS-301.5 / SRS-301.6 (non-PDF files are rejected with the exact
// message from the SRS) and SRS-306.3 (a second request for a document that is
// already Queued/Processing is refused instead of creating a duplicate).
import { getSupabaseClient } from '../../../lib/supabase';
import { ALREADY_IN_PROGRESS_MESSAGE, UNSUPPORTED_FORMAT_MESSAGE } from '../../../lib/extractions';

const EXTRACTION_COLUMNS = 'extraction_id, user_id, document_id, source_document_title, status, requested_at, completed_at';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

async function getAuthenticatedUser(token: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return { user: null, supabase: null, configError: true };

  const { data: { user }, error } = await supabase.auth.getUser(token);
  return { user: error ? null : user, supabase, configError: false };
}

export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  let body: { document_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'document_id is required.' }, { status: 400 });
  }

  const documentId = Number(body.document_id);
  if (!Number.isInteger(documentId) || documentId <= 0) {
    return Response.json({ error: 'document_id is required.' }, { status: 400 });
  }

  // Look up the selected document.
  const { data: document, error: documentError } = await supabase!
    .from('documents')
    .select('document_id, title, mime_type')
    .eq('document_id', documentId)
    .maybeSingle();

  if (documentError) return Response.json({ error: 'Could not load the selected document.' }, { status: 500 });
  if (!document) return Response.json({ error: 'The selected document was not found.' }, { status: 404 });

  // SRS-301.5 / SRS-301.6: only PDFs can be extracted. No request is created.
  if (document.mime_type !== 'application/pdf') {
    return Response.json({ error: UNSUPPORTED_FORMAT_MESSAGE }, { status: 400 });
  }

  // extractions.user_id references user_accounts. The starter's register route
  // only creates the Supabase auth user, so make sure the account row exists.
  const { error: accountError } = await supabase!
    .from('user_accounts')
    .upsert({ user_id: user.id, email: user.email }, { onConflict: 'user_id', ignoreDuplicates: true });

  if (accountError) return Response.json({ error: 'Could not prepare your account.' }, { status: 500 });

  // SRS-301.4: create exactly one extraction request, linked to the signed-in user.
  // user_id always comes from the verified token, never from the request body.
  const { data: extraction, error: insertError } = await supabase!
    .from('extractions')
    .insert({
      user_id: user.id,
      document_id: document.document_id,
      source_document_title: document.title,
      status: 'Queued',
    })
    .select(EXTRACTION_COLUMNS)
    .single();

  if (insertError) {
    // 23505 = unique violation on extractions_in_flight_uq (SRS-306.3).
    if (insertError.code === '23505') {
      return Response.json({ error: ALREADY_IN_PROGRESS_MESSAGE }, { status: 409 });
    }
    return Response.json({ error: 'The extraction request could not be created.' }, { status: 500 });
  }

  return Response.json({ extraction }, { status: 201 });
}

export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  // Only the signed-in user's own extractions are returned.
  const { data, error } = await supabase!
    .from('extractions')
    .select(EXTRACTION_COLUMNS)
    .eq('user_id', user.id)
    .order('requested_at', { ascending: false });

  if (error) return Response.json({ error: 'Could not load your extractions.' }, { status: 500 });

  return Response.json({ extractions: data ?? [] }, { status: 200 });
}
