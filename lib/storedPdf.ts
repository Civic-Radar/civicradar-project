import type { SupabaseClient } from './residentAuth';
import { DOCUMENTS_BUCKET, standardStoragePath } from './retrieval/storeDocumentFile';

// Shared by GET /api/documents/[id] and GET /api/documents/[id]/pdf. The signed
// Storage link made here stays on the server: the browser gets the link from
// lib/pdfLinkTicket.ts instead (card #726).

// Digits only and a safe integer. "0" and "007" are valid ids (no document, and 7).
export function parseDocumentId(value: string): number | null {
  const id = Number(value);
  return /^\d+$/.test(value) && Number.isSafeInteger(id) ? id : null;
}

export interface StoredFileRow {
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

async function signedUrl(supabase: SupabaseClient, path: string, seconds: number): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, seconds);
    if (!error && data?.signedUrl) return data.signedUrl;
  } catch {
    // Same outcome as an error result.
  }
  return null;
}

// Server-only signed Storage link to the stored PDF, valid for `seconds`. Null
// when the file is not a PDF, has no stored path, or cannot be signed at any
// of its paths. A failure is logged once, by document id only, never with the
// Storage message. Never send the result to the browser.
export async function signedStoredPdfUrl(
  supabase: SupabaseClient,
  documentId: number,
  row: StoredFileRow,
  seconds: number,
): Promise<string | null> {
  if (row.mime_type !== 'application/pdf') return null;
  const paths = storedPdfPaths(row);
  if (paths.length === 0) return null;
  for (const path of paths) {
    const url = await signedUrl(supabase, path, seconds);
    if (url) return url;
  }
  console.error(`Stored PDF link could not be created for document ${documentId}.`);
  return null;
}
