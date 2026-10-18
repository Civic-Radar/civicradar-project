import type { SupabaseClient } from '@supabase/supabase-js';
import { DOCUMENTS_BUCKET } from '../retrieval/storeDocumentFile';

// The Messages API limits a request to 32 MB, and base64 adds a third, so a
// raw file can be about 24 MB. 20 MiB leaves room for the prompt and JSON.
// Pages are not counted: the API rejects a PDF over its page limit itself.
export const MAX_PDF_BYTES = 20 * 1024 * 1024;

const PDF_HEADER = '%PDF-';

export interface StoredPdfInput {
  storagePath: string; // documents.storage_path
  mimeType: string; // documents.mime_type
}

// ok: false is a stored file the model cannot be given. Missing configuration
// and unexpected Storage errors throw instead. Either way the caller closes
// the attempt as Failed.
export type StoredPdfResult =
  | { ok: true; pdfBytes: Uint8Array; sizeBytes: number }
  | { ok: false; reason: 'missing' }
  | { ok: false; reason: 'not_pdf'; detail: 'mime_type' | 'header' }
  | { ok: false; reason: 'too_large'; sizeBytes: number }
  | { ok: false; reason: 'unreadable' };

function hasPdfHeader(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_HEADER.length) {
    return false;
  }
  for (let i = 0; i < PDF_HEADER.length; i++) {
    if (bytes[i] !== PDF_HEADER.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

// Storage answers a missing object with 404, either as the HTTP status or as
// statusCode "404" on a 400. "Bucket not found" is also 404 but is a
// configuration error, so it is not a missing file.
function isMissingObject(error: { status?: number; statusCode?: string; message: string }): boolean {
  const notFound = error.status === 404 || error.statusCode === '404';
  return notFound && !/bucket/i.test(error.message);
}

// Reads a stored document file for the summarizer. Read-only: one Storage
// download, no database call, nothing written or deleted.
export async function readStoredPdf(
  supabase: SupabaseClient,
  input: StoredPdfInput,
): Promise<StoredPdfResult> {
  // Without the service role key lib/supabase.ts falls back to the anon key,
  // and RLS makes every object in the private bucket look missing.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    throw new Error(
      'Stored PDF read needs SUPABASE_SERVICE_ROLE_KEY: without it the client falls back to the anon key and every file in the private documents bucket looks missing',
    );
  }

  if (input.mimeType !== 'application/pdf') {
    return { ok: false, reason: 'not_pdf', detail: 'mime_type' };
  }

  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(input.storagePath);

  if (error) {
    if (isMissingObject(error)) {
      return { ok: false, reason: 'missing' };
    }
    throw new Error(`Storage download failed for ${input.storagePath}: ${error.message}`);
  }

  let pdfBytes: Uint8Array;
  try {
    if (!data) {
      return { ok: false, reason: 'unreadable' };
    }
    pdfBytes = new Uint8Array(await data.arrayBuffer());
  } catch {
    return { ok: false, reason: 'unreadable' };
  }

  if (pdfBytes.length === 0) {
    return { ok: false, reason: 'unreadable' };
  }
  if (!hasPdfHeader(pdfBytes)) {
    return { ok: false, reason: 'not_pdf', detail: 'header' };
  }
  if (pdfBytes.length > MAX_PDF_BYTES) {
    return { ok: false, reason: 'too_large', sizeBytes: pdfBytes.length };
  }

  return { ok: true, pdfBytes, sizeBytes: pdfBytes.length };
}
