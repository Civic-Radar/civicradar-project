import { getAuthenticatedUser, getToken, type SupabaseClient } from '../../../../lib/residentAuth';
import { DOCUMENTS_BUCKET, standardStoragePath } from '../../../../lib/retrieval/storeDocumentFile';

// Always read the current row; never serve a build-time snapshot.
export const dynamic = 'force-dynamic';

const LOAD_ERROR = 'This document could not be loaded. Please try again.';

// Lifetime of the signed link to the stored PDF, in seconds: one hour, so the
// View source PDF link still opens after the page has been open a while (SRS-207.2).
const PDF_LINK_SECONDS = 3600;

// Digits only and a safe integer. "0" and "007" are valid ids (no document, and 7).
function parseDocumentId(value: string): number | null {
  const id = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(id) ? id : null;
}

interface StoredFileRow {
  town_id: number;
  source_file_id?: string | null;
  storage_path: string | null;
  mime_type: string | null;
}

// The paths to try, in order: the row's storage_path, then the standard path
// retrieval uses, for rows whose recorded path has no file (SRS-211.1, #514).
function storedPdfPaths(row: StoredFileRow): string[] {
  const paths = row.storage_path ? [row.storage_path] : [];
  if (row.source_file_id) {
    const standard = standardStoragePath(row.town_id, row.source_file_id, 'application/pdf');
    if (!paths.includes(standard)) paths.push(standard);
  }
  return paths;
}

async function signedUrl(supabase: SupabaseClient, path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, PDF_LINK_SECONDS);
    if (!error && data?.signedUrl) return data.signedUrl;
  } catch {
    // Same outcome as an error result.
  }
  return null;
}

// Short-lived Storage link to the stored PDF for the in-page viewer (SRS-203.2).
// Null when the file is not a PDF, has no stored path, or cannot be signed at
// any of its paths. A failure is logged once, by document id only, never with
// the Storage message.
async function storedPdfUrl(supabase: SupabaseClient, documentId: number, row: StoredFileRow): Promise<string | null> {
  if (row.mime_type !== 'application/pdf') return null;
  const paths = storedPdfPaths(row);
  if (paths.length === 0) return null;
  for (const path of paths) {
    const url = await signedUrl(supabase, path);
    if (url) return url;
  }
  console.error(`Stored PDF link could not be created for document ${documentId}.`);
  return null;
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
