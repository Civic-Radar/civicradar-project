import type { SupabaseClient } from '@supabase/supabase-js';

// Private Storage bucket that holds the stored copy of each document.
export const DOCUMENTS_BUCKET = 'documents';

const SOURCE_FILE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function extensionFor(mimeType: string): string {
  return mimeType === 'application/pdf' ? 'pdf' : 'bin';
}

// Thrown when the upload finds a file already at the path (SRS-208.3). The
// file in Storage is left as it is.
export class StoragePathExistsError extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`Storage path already exists: ${path}`);
    this.name = 'StoragePathExistsError';
    this.path = path;
  }
}

// Uploads a downloaded file to <town_id>/<source_file_id>.<ext> and returns
// the value for documents.storage_path. Never overwrites: an existing path
// throws StoragePathExistsError, and any other upload error throws.
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
    // storage-js reports an existing path with statusCode '409'.
    if ('statusCode' in error && error.statusCode === '409') {
      throw new StoragePathExistsError(path);
    }
    throw new Error(`Storage upload failed for ${path}: ${error.message}`);
  }

  return path;
}
