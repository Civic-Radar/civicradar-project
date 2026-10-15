import type { SupabaseClient } from '@supabase/supabase-js';
import type { SourceFile } from '../sources/types';

// The meetings row the source lists the file under.
export interface DocumentMeeting {
  meeting_id: number;
  town_id: number;
}

// The stored copy of the file: storeDocumentFile's path, downloadFile's MIME
// type, and hashFile's hash and size.
export interface StoredDocumentFile {
  storagePath: string;
  mimeType: string;
  sha256: string;
  sizeBytes: number;
}

// Inserts one documents row for a newly retrieved file (SRS-208.2) and returns
// its document_id. retrieved_at and summary_status keep their defaults. There
// is no duplicate guard (SRS-208.3): an existing (town_id, source_file_id) or
// storage_path is an insert error and throws.
export async function insertDocument(
  supabase: SupabaseClient,
  meeting: DocumentMeeting,
  file: SourceFile,
  stored: StoredDocumentFile,
): Promise<number> {
  const { data, error } = await supabase
    .from('documents')
    .insert({
      meeting_id: meeting.meeting_id,
      town_id: meeting.town_id,
      source_file_id: file.sourceFileId,
      title: file.fileName,
      document_type: file.documentType,
      source_url: file.sourcePageUrl,
      storage_path: stored.storagePath,
      mime_type: stored.mimeType,
      file_size_bytes: stored.sizeBytes,
      file_sha256: stored.sha256,
    })
    .select('document_id')
    .single();

  if (error) {
    throw new Error(`Could not insert document for source file ${file.sourceFileId} (${error.code}): ${error.message}`);
  }

  return data.document_id;
}
