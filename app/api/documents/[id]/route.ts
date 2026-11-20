import { getAuthenticatedUser, getToken, type SupabaseClient } from '../../../../lib/residentAuth';
import { getPdfLinkSecret, PDF_LINK_SECONDS, storedPdfLink } from '../../../../lib/pdfLinkTicket';
import { parseDocumentId, signedStoredPdfUrl, type StoredFileRow } from '../../../../lib/storedPdf';

// Always read the current row; never serve a build-time snapshot.
export const dynamic = 'force-dynamic';

const LOAD_ERROR = 'This document could not be loaded. Please try again.';

// Link to the stored PDF for the in-page viewer (SRS-203.2) and View source PDF
// (SRS-207.2), on our own domain: /api/documents/<id>/pdf?ticket=... (card #726).
// The Storage link is signed here only to confirm the file exists at one of its
// paths; it never leaves the server. Null when there is no stored PDF, or when
// PDF_LINK_SECRET is not set (logged by name only).
async function storedPdfUrl(supabase: SupabaseClient, documentId: number, row: StoredFileRow): Promise<string | null> {
  if (!getPdfLinkSecret()) {
    console.error('PDF_LINK_SECRET is not set, so no stored PDF link is shown.');
    return null;
  }
  const storageUrl = await signedStoredPdfUrl(supabase, documentId, row, PDF_LINK_SECONDS);
  return storageUrl ? storedPdfLink(documentId) : null;
}

// Returns one document's identification for its detail page (SRS-203.1),
// plus its summary status (SRS-210.2), its summary when Complete (SRS-204.2)
// and a short-lived link to its stored PDF (SRS-203.2). Signed-in residents
// only. No stored-file fields: storage_path and mime_type are read only to
// build the link.
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
      'document_id, meeting_id, town_id, title, document_type, source_url, retrieved_at, summary_status, summary_text, summary_generated_at, source_file_id, storage_path, mime_type',
    )
    .eq('document_id', documentId)
    .maybeSingle();

  if (error) return Response.json({ error: LOAD_ERROR }, { status: 500 });
  if (!document) return Response.json({ error: 'Document not found.' }, { status: 404 });

  // Built field by field so no other column leaks. summary_status is Pending,
  // Complete or Failed (table check), so the page can tell Failed from Pending.
  // The table checks guarantee Complete means the text and time are set.
  const complete = document.summary_status === 'Complete';
  const pdfUrl = await storedPdfUrl(supabase!, documentId, document);
  return Response.json({
    document: {
      document_id: document.document_id,
      meeting_id: document.meeting_id,
      town_id: document.town_id,
      title: document.title,
      document_type: document.document_type,
      source_url: document.source_url,
      retrieved_at: document.retrieved_at,
      summary_status: document.summary_status,
      summary_text: complete ? document.summary_text : null,
      summary_generated_at: complete ? document.summary_generated_at : null,
      pdf_url: pdfUrl,
    },
  }, { status: 200 });
}
