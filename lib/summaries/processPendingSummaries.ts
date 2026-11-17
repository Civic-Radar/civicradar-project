import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase';
import {
  findDocumentsWithoutAttempt,
  findInProgressAttempts,
  insertFirstAttempt,
  type InProgressAttempt,
} from './attempts';
import { MAX_SUMMARIES_PER_PROCESS_CALL, missingSummarySettings, runSummaryJob } from './runSummaryJob';

// What one processing batch did. POST /api/summaries/process maps each kind to
// its response, and the summary scheduler reads it to decide whether to go on.
export type ProcessPendingResult =
  | { kind: 'missing_settings'; missing: string[] }
  | { kind: 'no_client' }
  | { kind: 'read_failed'; message: string }
  | { kind: 'processed'; processed: number[] };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

// Records attempt 1 for each Pending document that has no attempt at all, up
// to limit, and returns the new attempts. Never throws: a failed read or
// insert is logged, and the stale attempts already found still run.
async function startDocumentsWithoutAttempt(
  supabase: SupabaseClient,
  limit: number,
): Promise<InProgressAttempt[]> {
  let documentIds: number[];
  try {
    documentIds = await findDocumentsWithoutAttempt(supabase, limit);
  } catch (error: unknown) {
    console.error(`Summary process: documents with no attempt not read: ${errorMessage(error)}`);
    return [];
  }

  const started: InProgressAttempt[] = [];
  for (const documentId of documentIds) {
    try {
      started.push(await insertFirstAttempt(supabase, documentId));
    } catch (error: unknown) {
      console.error(`Summary process: document ${documentId} still has no summary attempt: ${errorMessage(error)}`);
    }
  }
  if (started.length > 0) {
    console.log(`Summary process: recorded attempt 1 for ${started.length} Pending documents that had none`);
  }
  return started;
}

// Picks up documents whose summary attempt is still In progress after the
// stale window, so a missed trigger cannot strand a document (SRS-204.1).
// Then, while there is room, Pending documents that have no attempt at all
// (#513) get attempt 1. Takes at most MAX_SUMMARIES_PER_PROCESS_CALL jobs in
// all. Jobs run one at a time, and one job's error is logged and the next one
// still runs.
export async function processPendingSummaries(): Promise<ProcessPendingResult> {
  const missing = missingSummarySettings();
  if (missing.length > 0) {
    return { kind: 'missing_settings', missing };
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    return { kind: 'no_client' };
  }

  let attempts: InProgressAttempt[];
  try {
    attempts = await findInProgressAttempts(supabase, MAX_SUMMARIES_PER_PROCESS_CALL);
  } catch (error: unknown) {
    return { kind: 'read_failed', message: errorMessage(error) };
  }

  attempts = [
    ...attempts,
    ...(await startDocumentsWithoutAttempt(supabase, MAX_SUMMARIES_PER_PROCESS_CALL - attempts.length)),
  ];

  // Document ids whose job this call claimed and ran to an outcome.
  const processed: number[] = [];
  for (const attempt of attempts) {
    try {
      const outcome = await runSummaryJob(supabase, attempt);
      if (outcome.kind !== 'skipped') {
        processed.push(attempt.documentId);
      }
    } catch (error: unknown) {
      console.error(`Summary job: document ${attempt.documentId} failed: ${errorMessage(error)}`);
    }
  }

  return { kind: 'processed', processed };
}
