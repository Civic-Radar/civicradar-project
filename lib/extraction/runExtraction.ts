// Runs one extraction from start to finish (SRS-302.1, with the status changes of SRS-306.1):
//
//   Queued -> Processing -> read the document's text from CivicClerk
//          -> find the officials with Claude -> save them -> Completed
//
// Any problem on the way ends the extraction as Failed with a failure cause
// (SRS-307.2): 'Missing source file', 'Unreadable file', 'File too large', or 'Other'.
// Officials' details are never logged (SRS-310.3).
import type { SupabaseClient } from '@supabase/supabase-js';
import { DocumentTextError, fetchDocumentText } from '../sources/civicclerkFiles';
import { findOfficials, type FoundOfficial } from './findOfficials';

// 25 MB, the largest PDF the requirements size for (SRS-NFR-6, SRS-NFR-11).
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

type FailureCause = 'Missing source file' | 'Unreadable file' | 'File too large' | 'Other';

export type RunDeps = {
  fetchText: (sourceAccountId: string, sourceFileId: string) => Promise<string>;
  findOfficials: (text: string) => Promise<FoundOfficial[]>;
  now: () => string;
};

const defaultDeps: RunDeps = {
  fetchText: (account, fileId) => fetchDocumentText(account, fileId),
  findOfficials: (text) => findOfficials(text),
  now: () => new Date().toISOString(),
};

export type RunResult =
  | { outcome: 'ran'; status: 'Completed' | 'Failed'; officialsFound: number }
  | { outcome: 'not_found' }
  | { outcome: 'not_queued'; status: string };

const EXTRACTION_COLUMNS = 'extraction_id, user_id, document_id, status';

// Ends the extraction as Failed. Only the cause is stored, never error text.
class Failure extends Error {
  constructor(readonly cause: FailureCause) {
    super(cause);
  }
}

export async function runExtraction(
  supabase: SupabaseClient,
  extractionId: number,
  userId: string,
  deps: RunDeps = defaultDeps,
): Promise<RunResult> {
  // 1. Claim it: Queued -> Processing, only if it's this user's and still Queued.
  //    Doing this in one update means two clicks can never run it twice.
  const { data: claimed, error: claimError } = await supabase
    .from('extractions')
    .update({ status: 'Processing' })
    .eq('extraction_id', extractionId)
    .eq('user_id', userId)
    .eq('status', 'Queued')
    .select(EXTRACTION_COLUMNS)
    .maybeSingle();

  if (claimError) throw new Error('Could not start the extraction.');

  if (!claimed) {
    const { data: existing } = await supabase
      .from('extractions')
      .select(EXTRACTION_COLUMNS)
      .eq('extraction_id', extractionId)
      .eq('user_id', userId)
      .maybeSingle();
    return existing ? { outcome: 'not_queued', status: existing.status } : { outcome: 'not_found' };
  }

  try {
    // 2. Find the document and its town's CivicClerk account.
    if (claimed.document_id === null) throw new Failure('Missing source file');

    const { data: document } = await supabase
      .from('documents')
      .select('document_id, town_id, source_file_id, file_size_bytes')
      .eq('document_id', claimed.document_id)
      .maybeSingle();
    if (!document) throw new Failure('Missing source file');
    if (document.file_size_bytes > MAX_FILE_BYTES) throw new Failure('File too large');

    const { data: town } = await supabase
      .from('towns')
      .select('town_id, source_account_id')
      .eq('town_id', document.town_id)
      .maybeSingle();
    if (!town) throw new Failure('Missing source file');

    // 3. Read the document's text.
    let text: string;
    try {
      text = await deps.fetchText(town.source_account_id, document.source_file_id);
    } catch (error) {
      throw new Failure(error instanceof DocumentTextError ? error.failureCause : 'Other');
    }

    // 4. Find the officials.
    let officials: FoundOfficial[];
    try {
      officials = await deps.findOfficials(text);
    } catch {
      throw new Failure('Other');
    }

    // 5. Save them, one row per official, linked to this extraction.
    if (officials.length > 0) {
      const { error: insertError } = await supabase
        .from('extracted_officials')
        .insert(officials.map((official) => ({ extraction_id: extractionId, ...official })));
      if (insertError) throw new Failure('Other');
    }

    // 6. Done.
    const { error: doneError } = await supabase
      .from('extractions')
      .update({ status: 'Completed', completed_at: deps.now() })
      .eq('extraction_id', extractionId);
    if (doneError) throw new Failure('Other');

    return { outcome: 'ran', status: 'Completed', officialsFound: officials.length };
  } catch (error) {
    const cause: FailureCause = error instanceof Failure ? error.cause : 'Other';
    // Remove anything saved before the failure so a Failed extraction has no officials.
    await supabase.from('extracted_officials').delete().eq('extraction_id', extractionId);
    await supabase
      .from('extractions')
      .update({ status: 'Failed', failure_cause: cause, completed_at: deps.now() })
      .eq('extraction_id', extractionId);
    return { outcome: 'ran', status: 'Failed', officialsFound: 0 };
  }
}
