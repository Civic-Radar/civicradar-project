import { getSupabaseClient } from '../../../../lib/supabase';
import { findInProgressAttempts, type InProgressAttempt } from '../../../../lib/summaries/attempts';
import {
  getProcessSecret,
  isValidProcessSecret,
  SUMMARY_PROCESS_SECRET_HEADER,
} from '../../../../lib/summaries/processSecret';
import {
  MAX_SUMMARIES_PER_PROCESS_CALL,
  missingSummarySettings,
  runSummaryJob,
} from '../../../../lib/summaries/runSummaryJob';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

// Picks up documents whose summary attempt is still In progress after the
// stale window, so a missed trigger cannot strand a document (SRS-204.1).
// Protected by the x-summary-process-secret header. Jobs run one at a time.
export async function POST(request: Request) {
  if (!getProcessSecret()) {
    return Response.json({ error: 'Summary processing is not configured.' }, { status: 500 });
  }

  if (!isValidProcessSecret(request.headers.get(SUMMARY_PROCESS_SECRET_HEADER))) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const missing = missingSummarySettings();
  if (missing.length > 0) {
    return Response.json(
      { error: `Summary processing is not configured: missing ${missing.join(', ')}` },
      { status: 500 },
    );
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  }

  let attempts: InProgressAttempt[];
  try {
    attempts = await findInProgressAttempts(supabase, MAX_SUMMARIES_PER_PROCESS_CALL);
  } catch (error: unknown) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
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

  return Response.json({ processed }, { status: 200 });
}
