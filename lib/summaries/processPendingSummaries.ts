import { getSupabaseClient } from '../supabase';
import { findInProgressAttempts, type InProgressAttempt } from './attempts';
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

// Picks up documents whose summary attempt is still In progress after the
// stale window, so a missed trigger cannot strand a document (SRS-204.1).
// Takes at most MAX_SUMMARIES_PER_PROCESS_CALL attempts. Jobs run one at a
// time, and one job's error is logged and the next one still runs.
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
