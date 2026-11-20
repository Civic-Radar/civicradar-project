import { isValidPdfTicket } from '../../../../../lib/pdfLinkTicket';
import { parseDocumentId, signedStoredPdfUrl } from '../../../../../lib/storedPdf';
import { getSupabaseClient } from '../../../../../lib/supabase';

// Always read the current row and file; never serve a build-time snapshot.
export const dynamic = 'force-dynamic';

const LINK_REFUSED = 'This PDF link is not valid or has expired. Reopen the document page.';
const NOT_AVAILABLE = 'The PDF is not available.';

// The Storage link signed here is used once, right away, by this server.
const SERVER_LINK_SECONDS = 60;

// Only these headers from Storage reach the browser. Everything else, including
// any header that names Supabase, stays on the server.
const PASSED_HEADERS = ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'];

function pdfHeaders(documentId: number, upstream?: Headers): Headers {
  const headers = new Headers({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="document-${documentId}.pdf"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    // The ticket is in this address; do not send it on as a referrer.
    'Referrer-Policy': 'no-referrer',
  });
  for (const name of PASSED_HEADERS) {
    const value = upstream?.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

// Serves a document's stored PDF on our own domain (card #726), for the viewer
// on the detail page (SRS-203.2, SRS-203.3) and the View source PDF link
// (SRS-207.2). Access is by the ticket the signed-in detail route issued,
// because an iframe and a new tab cannot send the Authorization header. Range
// requests are passed through so the viewer can show page 1 before the whole
// file arrives (SRS-NFR-6). No response names Supabase, the bucket or a path.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const documentId = parseDocumentId(params.id);
  const ticket = new URL(request.url).searchParams.get('ticket');
  if (documentId === null || !isValidPdfTicket(documentId, ticket)) {
    return Response.json({ error: LINK_REFUSED }, { status: 403 });
  }

  // documents has Row Level Security, so only the service-role key reads it.
  const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY ? getSupabaseClient() : null;
  if (!supabase) return Response.json({ error: NOT_AVAILABLE }, { status: 500 });

  const { data: row, error } = await supabase
    .from('documents')
    .select('town_id, source_file_id, storage_path, mime_type')
    .eq('document_id', documentId)
    .maybeSingle();
  if (error) return Response.json({ error: NOT_AVAILABLE }, { status: 500 });
  if (!row) return Response.json({ error: NOT_AVAILABLE }, { status: 404 });

  const storageUrl = await signedStoredPdfUrl(supabase, documentId, row, SERVER_LINK_SECONDS);
  if (!storageUrl) return Response.json({ error: NOT_AVAILABLE }, { status: 404 });

  const range = request.headers.get('range');
  let upstream: Response;
  try {
    upstream = await fetch(storageUrl, { headers: range ? { Range: range } : {}, cache: 'no-store' });
  } catch {
    console.error(`Stored PDF could not be read for document ${documentId}.`);
    return Response.json({ error: NOT_AVAILABLE }, { status: 502 });
  }

  if (upstream.status === 416) {
    return new Response(null, { status: 416, headers: pdfHeaders(documentId, upstream.headers) });
  }
  if ((upstream.status !== 200 && upstream.status !== 206) || !upstream.body) {
    console.error(`Stored PDF could not be read for document ${documentId}.`);
    return Response.json({ error: NOT_AVAILABLE }, { status: 502 });
  }

  return new Response(upstream.body, { status: upstream.status, headers: pdfHeaders(documentId, upstream.headers) });
}
