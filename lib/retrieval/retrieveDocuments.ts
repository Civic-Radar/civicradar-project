import type { SupabaseClient } from '@supabase/supabase-js';
import type { SourceFile } from '../sources/types';
import { createSummaryStarter } from '../summaries/runSummaryJob';
import { hashFile } from './hashFile';
import { DocumentExistsError, insertDocument, type DocumentMeeting } from './insertDocument';
import { StoragePathExistsError, storeDocumentFile } from './storeDocumentFile';

// The source client's file download, passed in so this file stays source-agnostic.
export type DownloadFile = (file: SourceFile) => Promise<{ bytes: Uint8Array; mimeType: string }>;

// skipped counts files under a meeting with no meetings row. alreadyRetrieved
// counts files that already have a documents row (SRS-208.3).
export interface RetrieveDocumentsResult {
  stored: number;
  alreadyRetrieved: number;
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

// Returns the source file ids among the given ones that already have a
// documents row for the town. Throws on a failed read.
async function loadExistingFileIds(
  supabase: SupabaseClient,
  townId: number,
  sourceFileIds: string[],
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('documents')
    .select('source_file_id')
    .eq('town_id', townId)
    .in('source_file_id', sourceFileIds);

  if (error) {
    throw new Error(`Could not read documents: ${error.message}`);
  }

  return new Set((data ?? []).map((row) => row.source_file_id as string));
}

// One read after the upload found the path taken: true only when a documents
// row for the file now exists. A failed read is logged and counts as no row.
async function hasDocumentRow(
  supabase: SupabaseClient,
  townId: number,
  sourceFileId: string,
  where: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('documents')
    .select('document_id')
    .eq('town_id', townId)
    .eq('source_file_id', sourceFileId)
    .maybeSingle();

  if (error) {
    console.error(`Document retrieval: ${where} could not read documents after store: ${error.message}`);
    return false;
  }

  return data !== null;
}

// Downloads, stores and inserts every file the source lists under the town's
// meetings (SRS-208.2). Files are processed one at a time. A failure on one
// file is logged and the run moves on. A meeting with no meetings row is
// logged and its files are skipped. A file that already has a documents row
// for the town is skipped before the download and never changes its row
// (SRS-208.3). A row a concurrent run inserted first (a unique violation, or
// a taken Storage path with a row behind it) also counts as already
// retrieved, not failed. Each inserted document gets summary attempt 1
// (SRS-204.1), and after the run the first few queued summary jobs start
// without being awaited.
export async function retrieveDocuments(
  supabase: SupabaseClient,
  townId: number,
  filesByMeeting: Map<string, SourceFile[]>,
  download: DownloadFile,
): Promise<RetrieveDocumentsResult> {
  const result: RetrieveDocumentsResult = { stored: 0, alreadyRetrieved: 0, failed: 0, skipped: 0 };
  const meetings = await loadMeetings(supabase, townId, [...filesByMeeting.keys()]);
  const summaries = createSummaryStarter(supabase, townId);

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

    if (files.length === 0) {
      continue;
    }

    // One read per meeting. A failed read is never "no rows": the meeting's
    // files are not downloaded and count as failed.
    let existingFileIds: Set<string>;
    try {
      existingFileIds = await loadExistingFileIds(
        supabase,
        meeting.town_id,
        files.map((file) => file.sourceFileId),
      );
    } catch (error: unknown) {
      result.failed += files.length;
      console.error(
        `Document retrieval: town ${townId} meeting ${sourceMeetingId} failed at lookup, ${files.length} files not retrieved: ${errorMessage(error)}`,
      );
      continue;
    }

    for (const file of files) {
      if (existingFileIds.has(file.sourceFileId)) {
        result.alreadyRetrieved += 1;
        console.log(`Document retrieval: town ${townId} file ${file.sourceFileId} already retrieved, skipped`);
        continue;
      }

      const where = `town ${townId} meeting ${sourceMeetingId} file ${file.sourceFileId}`;
      let step = 'download';
      let storagePath: string | null = null;
      let documentId: number | null = null;

      try {
        const { bytes, mimeType } = await download(file);
        step = 'hash';
        const { sha256, sizeBytes } = hashFile(bytes);
        step = 'store';
        storagePath = await storeDocumentFile(supabase, meeting.town_id, file.sourceFileId, bytes, mimeType);
        step = 'insert';
        documentId = await insertDocument(supabase, meeting, file, { storagePath, mimeType, sha256, sizeBytes });
        result.stored += 1;
      } catch (error: unknown) {
        if (error instanceof DocumentExistsError) {
          // A concurrent run inserted the row first. This run's upload left a
          // file no row points at, so its path stays visible in the log.
          result.alreadyRetrieved += 1;
          console.log(`Document retrieval: ${where} already retrieved at insert`);
          console.error(`Document retrieval: ${where} ${storagePath} stored but no documents row`);
        } else if (error instanceof StoragePathExistsError) {
          // The Storage file is never overwritten, adopted or deleted.
          if (await hasDocumentRow(supabase, meeting.town_id, file.sourceFileId, where)) {
            result.alreadyRetrieved += 1;
            console.log(`Document retrieval: ${where} already retrieved at store`);
          } else {
            result.failed += 1;
            console.error(`Document retrieval: ${where} failed at store: ${error.path} stored but no documents row`);
          }
        } else {
          result.failed += 1;
          console.error(`Document retrieval: ${where} failed at ${step}: ${errorMessage(error)}`);
          if (step === 'insert' && storagePath) {
            console.error(`Document retrieval: ${where} ${storagePath} stored but no documents row`);
          }
        }
      }

      // Only a document this run inserted gets an attempt. Never throws.
      if (documentId !== null) {
        await summaries.recordAttempt(documentId);
      }
    }
  }

  summaries.startJobs();

  console.log(
    `Document retrieval: town ${townId} stored ${result.stored}, already retrieved ${result.alreadyRetrieved}, failed ${result.failed}, skipped ${result.skipped}`,
  );
  return result;
}
