import { getAuthenticatedUser, getToken } from '../../../../lib/residentAuth';

// Always read the current row; never serve a build-time snapshot.
export const dynamic = 'force-dynamic';

const LOAD_ERROR = 'This document could not be loaded. Please try again.';

// Digits only and a safe integer. "0" and "007" are valid ids (no document, and 7).
function parseDocumentId(value: string): number | null {
  const id = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(id) ? id : null;
}

// Returns one document's identification for its detail page (SRS-203.1),
// plus its summary when Complete (SRS-204.2). Signed-in residents only.
// No status or stored-file fields.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const documentId = parseDocumentId(params.id);
  if (documentId === null) return Response.json({ error: 'Invalid document id.' }, { status: 400 });

  const { data: document, error } = await supabase!
    .from('documents')
    .select(
      'document_id, meeting_id, town_id, title, document_type, source_url, retrieved_at, summary_status, summary_text, summary_generated_at',
    )
    .eq('document_id', documentId)
    .maybeSingle();

  if (error) return Response.json({ error: LOAD_ERROR }, { status: 500 });
  if (!document) return Response.json({ error: 'Document not found.' }, { status: 404 });

  // Built field by field so summary_status and any other column never leak.
  // The table checks guarantee Complete means the text and time are set.
  const complete = document.summary_status === 'Complete';
  return Response.json({
    document: {
      document_id: document.document_id,
      meeting_id: document.meeting_id,
      town_id: document.town_id,
      title: document.title,
      document_type: document.document_type,
      source_url: document.source_url,
      retrieved_at: document.retrieved_at,
      summary_text: complete ? document.summary_text : null,
      summary_generated_at: complete ? document.summary_generated_at : null,
    },
  }, { status: 200 });
}
