import { createHash } from 'node:crypto';
import { downloadFileName } from '../../../../../lib/downloadFileName';
import { getAuthenticatedUser, getToken, type SupabaseClient } from '../../../../../lib/residentAuth';
import { parseDocumentId, signedStoredPdfUrl } from '../../../../../lib/storedPdf';

// Always read the current row and file; never serve a build-time snapshot.
export const dynamic = 'force-dynamic';

const NOT_AVAILABLE = 'The PDF is not available.';
const NOT_IDENTICAL = 'The PDF could not be downloaded. Please try again.';

// The Storage link signed here is used once, right away, by this server.
const SERVER_LINK_SECONDS = 60;

function downloadHeaders(fileName: string, byteLength: number): Headers {
  return new Headers({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${fileName}"`,
    'Content-Length': String(byteLength),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
}

type NamedRow = { town_id: number; meeting_id: number | null; document_type: string | null };

// One row from `table`, or null. A failed read is logged and treated as missing,
// so the download still goes ahead under a name with that part in words.
async function readOne<T>(
  supabase: SupabaseClient,
  documentId: number,
  table: string,
  columns: string,
  idColumn: string,
  id: number | null,
): Promise<T | null> {
  if (id === null) return null;
  const { data, error } = await supabase.from(table).select(columns).eq(idColumn, id).maybeSingle();
  if (error) {
    console.error(`PDF download: document ${documentId} could not read ${table} for the file name: ${error.message}`);
    return null;
  }
  return (data as T | null) ?? null;
}

// SRS-214.3: Town_Body_YYYY-MM-DD_Type.pdf, from the document's town, its
// meeting's governing body and local date, and its type.
async function fileNameFor(supabase: SupabaseClient, documentId: number, row: NamedRow): Promise<string> {
  const town = await readOne<{ name: string | null; meeting_time_zone: string | null }>(
    supabase, documentId, 'towns', 'name, meeting_time_zone', 'town_id', row.town_id,
  );
  const meeting = await readOne<{ start_at: string | null; body_id: number | null; source_body_name: string | null }>(
    supabase, documentId, 'meetings', 'start_at, body_id, source_body_name', 'meeting_id', row.meeting_id,
  );
  const body = await readOne<{ name: string | null }>(
    supabase, documentId, 'governing_bodies', 'name', 'body_id', meeting?.body_id ?? null,
  );
  return downloadFileName({
    town: town?.name ?? null,
    body: body?.name ?? meeting?.source_body_name ?? null,
    startAt: meeting?.start_at ?? null,
    timeZone: town?.meeting_time_zone ?? null,
    type: row.document_type,
  });
}

// Sends a document's stored PDF as a download for the Download PDF button
// (SRS-214.1). Signed-in residents only; the page sends its token, so no
// ticket is needed in the address. The server reads the file from Storage, so
// no response names Supabase, the bucket or a storage path. The file is sent
// only when its SHA-256 matches the checksum stored when it was retrieved, so
// the download is a byte-identical copy of the retrieved PDF (SRS-214.2). It
// is named Town_Body_YYYY-MM-DD_Type.pdf (SRS-214.3).
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
    .select('town_id, meeting_id, document_type, source_file_id, storage_path, mime_type, file_sha256')
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

  // SRS-214.2: never send a copy that differs from the retrieved file.
  const sha256 = createHash('sha256').update(new Uint8Array(bytes)).digest('hex');
  if (sha256 !== row.file_sha256) {
    console.error(`PDF download: document ${documentId} stored file does not match its retrieved checksum.`);
    return Response.json({ error: NOT_IDENTICAL }, { status: 502 });
  }

  const fileName = await fileNameFor(supabase!, documentId, row);
  return new Response(bytes, { status: 200, headers: downloadHeaders(fileName, bytes.byteLength) });
}
