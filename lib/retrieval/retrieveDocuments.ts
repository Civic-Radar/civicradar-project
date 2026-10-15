import type { SupabaseClient } from '@supabase/supabase-js';
import type { SourceFile } from '../sources/types';
import { hashFile } from './hashFile';
import { insertDocument, type DocumentMeeting } from './insertDocument';
import { storeDocumentFile } from './storeDocumentFile';

// The source client's file download, passed in so this file stays source-agnostic.
export type DownloadFile = (file: SourceFile) => Promise<{ bytes: Uint8Array; mimeType: string }>;

export interface RetrieveDocumentsResult {
  stored: number;
  failed: number;
  skipped: number;
}

// Keeps each .in() filter well inside the request URL limit and the row cap.
const LOOKUP_CHUNK_SIZE = 100;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

// Maps each source meeting id to its meetings row for the town. Throws on
// any failed read.
async function loadMeetings(
  supabase: SupabaseClient,
  townId: number,
  sourceMeetingIds: string[],
): Promise<Map<string, DocumentMeeting>> {
  const meetings = new Map<string, DocumentMeeting>();

  for (let start = 0; start < sourceMeetingIds.length; start += LOOKUP_CHUNK_SIZE) {
    const chunk = sourceMeetingIds.slice(start, start + LOOKUP_CHUNK_SIZE);
    const { data, error } = await supabase
      .from('meetings')
      .select('meeting_id, town_id, source_meeting_id')
      .eq('town_id', townId)
      .in('source_meeting_id', chunk);

    if (error) {
      throw new Error(`Could not read meetings: ${error.message}`);
    }

    for (const row of data ?? []) {
      meetings.set(row.source_meeting_id, { meeting_id: row.meeting_id, town_id: row.town_id });
    }
  }

  return meetings;
}

// Downloads, stores and inserts every file the source lists under the town's
// meetings (SRS-208.2). Files are processed one at a time. A failure on one
// file is logged and the run moves on. A meeting with no meetings row is
// logged and its files are skipped. There is no duplicate guard (SRS-208.3):
// an already stored file fails at the upload and is counted as failed.
export async function retrieveDocuments(
  supabase: SupabaseClient,
  townId: number,
  filesByMeeting: Map<string, SourceFile[]>,
  download: DownloadFile,
): Promise<RetrieveDocumentsResult> {
  const result: RetrieveDocumentsResult = { stored: 0, failed: 0, skipped: 0 };
  const meetings = await loadMeetings(supabase, townId, [...filesByMeeting.keys()]);

  for (const [sourceMeetingId, files] of filesByMeeting) {
    const meeting = meetings.get(sourceMeetingId);
    if (!meeting) {
      if (files.length > 0) {
        console.error(
          `Document retrieval: town ${townId} meeting ${sourceMeetingId} has no meetings row, skipped ${files.length} files`,
        );
      }
      result.skipped += files.length;
      continue;
    }

    for (const file of files) {
      const where = `town ${townId} meeting ${sourceMeetingId} file ${file.sourceFileId}`;
      let step = 'download';
      let storagePath: string | null = null;

      try {
        const { bytes, mimeType } = await download(file);
        step = 'hash';
        const { sha256, sizeBytes } = hashFile(bytes);
        step = 'store';
        storagePath = await storeDocumentFile(supabase, meeting.town_id, file.sourceFileId, bytes, mimeType);
        step = 'insert';
        await insertDocument(supabase, meeting, file, { storagePath, mimeType, sha256, sizeBytes });
        result.stored += 1;
      } catch (error: unknown) {
        result.failed += 1;
        console.error(`Document retrieval: ${where} failed at ${step}: ${errorMessage(error)}`);
        if (step === 'insert' && storagePath) {
          console.error(`Document retrieval: ${where} ${storagePath} stored but no documents row`);
        }
      }
    }
  }

  console.log(
    `Document retrieval: town ${townId} stored ${result.stored}, failed ${result.failed}, skipped ${result.skipped}`,
  );
  return result;
}
