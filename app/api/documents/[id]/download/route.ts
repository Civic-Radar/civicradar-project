import { getAuthenticatedUser, getToken } from '../../../../../lib/residentAuth';
import { parseDocumentId, signedStoredPdfUrl } from '../../../../../lib/storedPdf';

// Always read the current row and file; never serve a build-time snapshot.
export const dynamic = 'force-dynamic';

const NOT_AVAILABLE = 'The PDF is not available.';

// The Storage link signed here is used once, right away, by this server.
const SERVER_LINK_SECONDS = 60;

function downloadHeaders(documentId: number, byteLength: number): Headers {
  return new Headers({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="document-${documentId}.pdf"`,
    'Content-Length': String(byteLength),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
}

// Sends a document's stored PDF as a download for the Download PDF button
// (SRS-214.1). Signed-in residents only; the page sends its token, so no
// ticket is needed in the address. The server reads the file from Storage, so
// no response names Supabase, the bucket or a storage path.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const documentId = parseDocumentId(params.id);
  if (documentId === null) return Response.json({ error: 'Invalid document id.' }, { status: 400 });

  const { data: row, error } = await supabase!
    .from('documents')
    .select('town_id, source_file_id, storage_path, mime_type')
    .eq('document_id', documentId)
    .maybeSingle();
  if (error) {
    console.error(`PDF download: document ${documentId} could not be read: ${error.message}`);
    return Response.json({ error: NOT_AVAILABLE }, { status: 500 });
  }
  if (!row) return Response.json({ error: 'Document not found.' }, { status: 404 });

  const storageUrl = await signedStoredPdfUrl(supabase!, documentId, row, SERVER_LINK_SECONDS);
  if (!storageUrl) return Response.json({ error: NOT_AVAILABLE }, { status: 404 });

  let bytes: ArrayBuffer;
  try {
    const upstream = await fetch(storageUrl, { cache: 'no-store' });
    if (!upstream.ok) throw new Error(`Storage answered ${upstream.status}`);
    bytes = await upstream.arrayBuffer();
  } catch (thrown: unknown) {
    console.error(
      `PDF download: document ${documentId} could not be read from Storage: ${thrown instanceof Error ? thrown.message : 'unknown error'}`,
    );
    return Response.json({ error: NOT_AVAILABLE }, { status: 502 });
  }

  return new Response(bytes, { status: 200, headers: downloadHeaders(documentId, bytes.byteLength) });
}
