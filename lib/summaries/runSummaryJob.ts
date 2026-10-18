import type { SupabaseClient } from '@supabase/supabase-js';
import type { DocumentType } from '../sources/types';
import {
  claimAttempt,
  finishAttempt,
  insertFirstAttempt,
  type FinishResult,
  type InProgressAttempt,
} from './attempts';
import { readStoredPdf, type StoredPdfResult } from './readStoredPdf';
import { summarizeDocument, type SummaryResult } from './summarize';

// Cost caps: the most summary jobs one retrieval run or one process call starts.
export const MAX_SUMMARY_STARTS_PER_RUN = 5;
export const MAX_SUMMARIES_PER_PROCESS_CALL = 5;

const SUMMARY_SETTINGS = ['ANTHROPIC_API_KEY', 'SUMMARY_MODEL', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

// Names (never values) of the settings a summary job needs that are not set.
// Checked once before any job starts, so a missing setting leaves attempts
// In progress instead of failing each one.
export function missingSummarySettings(): string[] {
  return SUMMARY_SETTINGS.filter((name) => !process.env[name]?.trim());
}

type ProducedSummary =
  | { kind: 'succeeded'; attemptId: number; documentId: number; text: string; wordCount: number }
  | {
      kind: 'failed';
      attemptId: number;
      documentId: number;
      stage: 'read' | 'summarize';
      reason: string;
      message?: string;
    };

// finish is what finish_summary_attempt did with the result: 'closed' stored
// it, anything else changed nothing.
export type SummaryJobOutcome =
  | { kind: 'skipped'; documentId: number; reason: 'not_claimed' | 'not_pending' }
  | (ProducedSummary & { finish: FinishResult });

interface SummaryDocumentRow {
  document_id: number;
  town_id: number;
  title: string;
  document_type: DocumentType;
  storage_path: string;
  mime_type: string;
  summary_status: string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

async function loadDocument(supabase: SupabaseClient, documentId: number): Promise<SummaryDocumentRow> {
  const { data, error } = await supabase
    .from('documents')
    .select('document_id, town_id, title, document_type, storage_path, mime_type, summary_status')
    .eq('document_id', documentId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not read document: ${error.message}`);
  }
  if (!data) {
    throw new Error('Document not found');
  }
  return data;
}

async function loadTownName(supabase: SupabaseClient, townId: number): Promise<string> {
  const { data, error } = await supabase.from('towns').select('name').eq('town_id', townId).maybeSingle();

  if (error) {
    throw new Error(`Could not read town ${townId}: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Town ${townId} not found`);
  }
  return data.name;
}

// Reads the stored PDF and summarizes it. A throw from either step is a failed
// attempt too, as readStoredPdf and summarizeDocument document.
async function produceSummary(
  supabase: SupabaseClient,
  attemptId: number,
  document: SummaryDocumentRow,
  townName: string,
): Promise<ProducedSummary> {
  const failed = (stage: 'read' | 'summarize', reason: string, message?: string): ProducedSummary => ({
    kind: 'failed',
    attemptId,
    documentId: document.document_id,
    stage,
    reason,
    message,
  });

  let stored: StoredPdfResult;
  try {
    stored = await readStoredPdf(supabase, { storagePath: document.storage_path, mimeType: document.mime_type });
  } catch (error: unknown) {
    return failed('read', 'error', errorMessage(error));
  }
  if (!stored.ok) {
    return failed('read', stored.reason);
  }

  let summary: SummaryResult;
  try {
    summary = await summarizeDocument({
      pdfBytes: stored.pdfBytes,
      documentType: document.document_type,
      title: document.title,
      townName,
    });
  } catch (error: unknown) {
    return failed('summarize', 'error', errorMessage(error));
  }
  if (!summary.ok) {
    return failed('summarize', summary.reason);
  }

  return {
    kind: 'succeeded',
    attemptId,
    documentId: document.document_id,
    text: summary.text,
    wordCount: summary.wordCount,
  };
}

// Never logs the summary text or the file.
function logOutcome(outcome: SummaryJobOutcome): void {
  if (outcome.kind === 'skipped') {
    return;
  }

  const where = `Summary job: document ${outcome.documentId} attempt ${outcome.attemptId}`;
  if (outcome.kind === 'succeeded') {
    if (outcome.finish === 'closed') {
      console.log(`${where} succeeded (${outcome.wordCount} words), stored, status Complete`);
    } else {
      console.error(`${where} succeeded (${outcome.wordCount} words), not stored: ${outcome.finish}`);
    }
    return;
  }

  const detail = outcome.message ? `: ${outcome.message}` : '';
  const closed = outcome.finish === 'closed' ? 'attempt closed as Failed' : `attempt not closed: ${outcome.finish}`;
  console.error(`${where} failed at ${outcome.stage}: ${outcome.reason}${detail}, ${closed}`);
}

// Claims an In progress attempt, loads its document and town name, reads the
// stored PDF, summarizes it and finishes the attempt (SRS-204.1): a summary is
// stored and the attempt closed as Succeeded, any failure closes it as Failed
// with no retry (SRS-210.1). A lost claim or a document that is no longer
// Pending is skipped. A failed database read or finish throws and leaves the
// attempt In progress for POST /api/summaries/process.
export async function runSummaryJob(
  supabase: SupabaseClient,
  attempt: InProgressAttempt,
): Promise<SummaryJobOutcome> {
  const claimed = await claimAttempt(supabase, attempt);
  if (!claimed) {
    return { kind: 'skipped', documentId: attempt.documentId, reason: 'not_claimed' };
  }

  const document = await loadDocument(supabase, attempt.documentId);
  if (document.summary_status !== 'Pending') {
    return { kind: 'skipped', documentId: attempt.documentId, reason: 'not_pending' };
  }

  const townName = await loadTownName(supabase, document.town_id);
  const produced = await produceSummary(supabase, attempt.attemptId, document, townName);
  const finish = await finishAttempt(
    supabase,
    produced.attemptId,
    produced.kind === 'succeeded' ? { outcome: 'Succeeded', summaryText: produced.text } : { outcome: 'Failed' },
  );

  const outcome: SummaryJobOutcome = { ...produced, finish };
  logOutcome(outcome);
  return outcome;
}

function logJobError(documentId: number, error: unknown): void {
  console.error(`Summary job: document ${documentId} failed: ${errorMessage(error)}`);
}

// Runs the jobs one at a time, in order. One job's error is logged and the
// next one still runs.
async function runJobsInOrder(supabase: SupabaseClient, attempts: InProgressAttempt[]): Promise<void> {
  for (const attempt of attempts) {
    await runSummaryJob(supabase, attempt).catch((error: unknown) => logJobError(attempt.documentId, error));
  }
}

// Used by a retrieval run: recordAttempt inserts attempt 1 for each new
// document and queues the first MAX_SUMMARY_STARTS_PER_RUN of them. startJobs,
// called after the run, works through the queue in one promise that is not
// awaited. Attempts past the cap, or recorded while a setting is missing, stay
// In progress for POST /api/summaries/process.
export function createSummaryStarter(supabase: SupabaseClient, townId: number) {
  const missing = missingSummarySettings();
  const queued: InProgressAttempt[] = [];
  let recorded = 0;

  return {
    // Never throws. A failed insert is logged and the document has no attempt.
    async recordAttempt(documentId: number): Promise<void> {
      let attempt: InProgressAttempt;
      try {
        attempt = await insertFirstAttempt(supabase, documentId);
      } catch (error: unknown) {
        console.error(`Summary start: document ${documentId} has no summary attempt: ${errorMessage(error)}`);
        return;
      }

      recorded += 1;
      if (queued.length < MAX_SUMMARY_STARTS_PER_RUN) {
        queued.push(attempt);
      }
    },

    startJobs(): void {
      if (recorded === 0) {
        return;
      }

      if (missing.length > 0) {
        console.error(
          `Summary start: town ${townId} recorded ${recorded} attempts, started 0, missing ${missing.join(', ')}. They stay In progress for POST /api/summaries/process`,
        );
        return;
      }

      console.log(
        `Summary start: town ${townId} recorded ${recorded} attempts, starting ${queued.length}, left ${recorded - queued.length} for POST /api/summaries/process`,
      );

      const attempts = [...queued];
      void runJobsInOrder(supabase, attempts).catch((error: unknown) => {
        console.error(`Summary job: town ${townId} queued jobs stopped: ${errorMessage(error)}`);
      });
    },
  };
}
