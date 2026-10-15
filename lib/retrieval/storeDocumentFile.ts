import type { SupabaseClient } from '@supabase/supabase-js';

// Private Storage bucket that holds the stored copy of each document.
export const DOCUMENTS_BUCKET = 'documents';

const SOURCE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function extensionFor(mimeType: string): string {
  return mimeType === 'application/pdf' ? 'pdf' : 'bin';
}

// Uploads a downloaded file to <town_id>/<source_file_id>.<ext> and returns
// the value for documents.storage_path. Never overwrites: an existing path
// is an upload error and throws.
export async function storeDocumentFile(
  supabase: SupabaseClient,
  townId: number,
  sourceFileId: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<string> {
  if (!SOURCE_FILE_ID_PATTERN.test(sourceFileId)) {
    throw new Error(`Invalid source file id for storage path: ${JSON.stringify(sourceFileId)}`);
  }

  const path = `${townId}/${sourceFileId}.${extensionFor(mimeType)}`;

  const { error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, bytes, { contentType: mimeType, upsert: false });

  if (error) {
    throw new Error(`Storage upload failed for ${path}: ${error.message}`);
  }

  return path;
}
