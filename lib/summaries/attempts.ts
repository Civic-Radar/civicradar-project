import type { SupabaseClient } from '@supabase/supabase-js';

// An attempt still In progress this long after it started (or was last
// claimed) has no job working on it, so POST /api/summaries/process may take it.
export const STALE_ATTEMPT_MINUTES = 15;

// A summary_attempts row that is In progress. startedAt is the value as read,
// used by claimAttempt to check nobody else claimed it since.
export interface InProgressAttempt {
  attemptId: number;
  documentId: number;
  startedAt: string;
}

interface AttemptRow {
  attempt_id: number;
  document_id: number;
  started_at: string;
}

function toAttempt(row: AttemptRow): InProgressAttempt {
  return { attemptId: row.attempt_id, documentId: row.document_id, startedAt: row.started_at };
}

// Records attempt 1 for a newly inserted document (SRS-204.1). outcome and
// started_at keep their defaults (In progress, now). Throws on any insert error.
export async function insertFirstAttempt(supabase: SupabaseClient, documentId: number): Promise<InProgressAttempt> {
  const { data, error } = await supabase
    .from('summary_attempts')
    .insert({ document_id: documentId, attempt_number: 1 })
    .select('attempt_id, document_id, started_at')
    .single();

  if (error) {
    throw new Error(`Could not insert summary attempt for document ${documentId} (${error.code}): ${error.message}`);
  }

  return toAttempt(data);
}

// Claims an attempt by compare-and-set on started_at: the update only matches
// while the attempt is In progress and started_at is still the value read, so
// of two overlapping callers only one gets the row back. The new started_at
// also keeps it out of the stale window. Returns null when the claim is lost.
export async function claimAttempt(
  supabase: SupabaseClient,
  attempt: InProgressAttempt,
): Promise<InProgressAttempt | null> {
  const { data, error } = await supabase
    .from('summary_attempts')
    .update({ started_at: new Date().toISOString() })
    .eq('attempt_id', attempt.attemptId)
    .eq('outcome', 'In progress')
    .eq('started_at', attempt.startedAt)
    .select('attempt_id, document_id, started_at');

  if (error) {
    throw new Error(`Could not claim summary attempt ${attempt.attemptId}: ${error.message}`);
  }

  return data && data.length > 0 ? toAttempt(data[0]) : null;
}

// Oldest In progress attempts that started before the stale window, at most
// limit. Throws on any failed read.
export async function findInProgressAttempts(supabase: SupabaseClient, limit: number): Promise<InProgressAttempt[]> {
  const staleBefore = new Date(Date.now() - STALE_ATTEMPT_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('summary_attempts')
    .select('attempt_id, document_id, started_at')
    .eq('outcome', 'In progress')
    .lt('started_at', staleBefore)
    .order('started_at', { ascending: true })
    .order('attempt_id', { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Could not read summary attempts: ${error.message}`);
  }

  return (data ?? []).map(toAttempt);
}
