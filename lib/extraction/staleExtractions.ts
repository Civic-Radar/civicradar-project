// Bug #517 (SRS-306.1, AO, Extraction status display): an extraction stayed
// "Processing" forever when the server stopped in the middle of a run.
//
// An extraction runs inside one request (runExtraction). If the server stops
// during it, nothing is left to finish the extraction, so its status never moves
// on. The user then can't request the document again (SRS-306.3) and gets no
// failure message or Retry control (SRS-307.1, SRS-307.5).
//
// failStaleExtractions ends those extractions as Failed: any of the user's
// extractions that is still Processing long after it was requested. It runs
// whenever the user's extractions are read or a new one is requested, so the
// status shown is always one that can still change.
//
// A run takes seconds, or a few minutes for a long packet, so the default wait is
// 10 minutes (EXTRACTION_STALE_MINUTES in .env.local changes it). If a run was
// only slow and does finish later, it still records its real result.
import type { SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_STALE_MINUTES = 10;

export function staleAfterMinutes(): number {
  const minutes = Number(process.env.EXTRACTION_STALE_MINUTES);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_STALE_MINUTES;
}

// Extractions requested before this moment and still Processing are stale.
export function staleBefore(now: Date): Date {
  return new Date(now.getTime() - staleAfterMinutes() * 60_000);
}

// Ends the user's stale Processing extractions as Failed. Returns how many.
// The cause is 'Other': the file itself was not the problem (SRS-307.3).
// Never throws: reading the user's extractions must not fail because of this.
export async function failStaleExtractions(supabase: SupabaseClient, userId: string, now = new Date()): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('extractions')
      .update({ status: 'Failed', failure_cause: 'Other', completed_at: now.toISOString() })
      .eq('user_id', userId)
      .eq('status', 'Processing')
      .lt('requested_at', staleBefore(now).toISOString())
      .select('extraction_id');
    if (error) return 0;
    return data?.length ?? 0;
  } catch {
    return 0;
  }
}
