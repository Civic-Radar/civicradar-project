import { getAuthenticatedUser, getToken, type SupabaseClient } from '../../../../lib/residentAuth';
import { DOCUMENTS_BUCKET } from '../../../../lib/retrieval/storeDocumentFile';

// Always read the current row; never serve a build-time snapshot.
export const dynamic = 'force-dynamic';

const LOAD_ERROR = 'This document could not be loaded. Please try again.';

// Lifetime of the signed link to the stored PDF, in seconds.
const PDF_LINK_SECONDS = 600;

// Digits only and a safe integer. "0" and "007" are valid ids (no document, and 7).
function parseDocumentId(value: string): number | null {
  const id = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(id) ? id : null;
}

// Short-lived Storage link to the stored PDF for the in-page viewer (SRS-203.2).
// Null when the file is not a PDF, has no stored path, or cannot be signed.
// A failure is logged by document id only, never with the Storage message.
async function storedPdfUrl(
  supabase: SupabaseClient,
  documentId: number,
  storagePath: string | null,
  mimeType: string | null,
): Promise<string | null> {
  if (mimeType !== 'application/pdf' || !storagePath) return null;
  try {
    const { data, error } = await supabase.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(storagePath, PDF_LINK_SECONDS);
    if (!error && data?.signedUrl) return data.signedUrl;
  } catch {
    // Same outcome as an error result.
  }
  console.error(`Stored PDF link could not be created for document ${documentId}.`);
  return null;
}

// Returns one document's identification for its detail page (SRS-203.1),
// plus its summary when Complete (SRS-204.2) and a short-lived link to its
// stored PDF (SRS-203.2). Signed-in residents only. No status or stored-file
// fields: storage_path and mime_type are read only to build the link.
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
      'document_id, meeting_id, town_id, title, document_type, source_url, retrieved_at, summary_status, summary_text, summary_generated_at, storage_path, mime_type',
    )
    .eq('document_id', documentId)
    .maybeSingle();

  if (error) return Response.json({ error: LOAD_ERROR }, { status: 500 });
  if (!document) return Response.json({ error: 'Document not found.' }, { status: 404 });

  // Built field by field so summary_status and any other column never leak.
  // The table checks guarantee Complete means the text and time are set.
  const complete = document.summary_status === 'Complete';
  const pdfUrl = await storedPdfUrl(supabase!, documentId, document.storage_path, document.mime_type);
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
      pdf_url: pdfUrl,
    },
  }, { status: 200 });
}
