import type { SupabaseClient } from '@supabase/supabase-js';
import { getTownSource } from '../sources';
import { runTownRetrieval, type RetrievalOptions, type RetrievalRunTown } from './runTownRetrieval';

// A check that started this recently and has not ended is taken to be still
// running, so the town is skipped instead of checked twice at once. An older
// open row is a check that died without closing and does not block.
export const RUNNING_CHECK_MINUTES = 60;

// Counts only: never an error message, a title or a secret.
export type TownCheckCount =
  | { townId: number; status: 'checked'; saved: number; complete: boolean }
  | { townId: number; status: 'skipped' }
  | { townId: number; status: 'failed' };

export interface TownCheckTotals {
  towns: number;
  checked: number;
  skipped: number;
  failed: number;
  saved: number;
}

export type AllTownChecksResult =
  | { ok: true; towns: TownCheckCount[]; totals: TownCheckTotals }
  | { ok: false }; // the town list could not be read

// True when the town has a source_checks row with no end time that started
// within RUNNING_CHECK_MINUTES. Throws when the read fails.
async function hasRunningCheck(supabase: SupabaseClient, townId: number, now: () => Date): Promise<boolean> {
  const since = new Date(now().getTime() - RUNNING_CHECK_MINUTES * 60_000).toISOString();
  const { data, error } = await supabase
    .from('source_checks')
    .select('check_id')
    .eq('town_id', townId)
    .is('ended_at', null)
    .gte('started_at', since)
    .limit(1);

  if (error) {
    throw new Error('running check read failed');
  }
  return (data ?? []).length > 0;
}

// One town's part of the scheduled run. Never throws: anything that goes
// wrong counts the town as failed.
async function checkTown(
  supabase: SupabaseClient,
  town: RetrievalRunTown,
  options: RetrievalOptions,
  now: () => Date,
): Promise<TownCheckCount> {
  try {
    if (await hasRunningCheck(supabase, town.town_id, now)) {
      return { townId: town.town_id, status: 'skipped' };
    }

    const result = await runTownRetrieval(supabase, town, getTownSource(town), { ...options, now });
    if (!result.ok) {
      return { townId: town.town_id, status: 'failed' };
    }
    return { townId: town.town_id, status: 'checked', saved: result.saved, complete: result.complete };
  } catch {
    return { townId: town.town_id, status: 'failed' };
  }
}

function logTownCount(count: TownCheckCount): void {
  if (count.status === 'checked') {
    console.log(
      `Scheduled check: town ${count.townId} checked, saved ${count.saved}, complete ${count.complete}`,
    );
  } else {
    console.log(`Scheduled check: town ${count.townId} ${count.status}`);
  }
}

// The scheduled check (SRS-208.1): one retrieval run for every supported town
// (removed_at null), in town_id order, one after the other, each through
// runTownRetrieval, which records and closes the town's check (SRS-222.1).
// One failing town never stops the next. Returns and logs counts only.
export async function runAllTownChecks(
  supabase: SupabaseClient,
  options: RetrievalOptions,
): Promise<AllTownChecksResult> {
  const { now = () => new Date() } = options;

  let towns: RetrievalRunTown[];
  try {
    const { data, error } = await supabase
      .from('towns')
      .select('town_id, source_account_id, meeting_time_zone, provides_agenda_items')
      .is('removed_at', null)
      .order('town_id', { ascending: true });

    if (error || !data) {
      console.error('Scheduled check: the town list could not be read');
      return { ok: false };
    }
    towns = data as RetrievalRunTown[];
  } catch {
    console.error('Scheduled check: the town list could not be read');
    return { ok: false };
  }

  const counts: TownCheckCount[] = [];
  for (const town of towns) {
    const count = await checkTown(supabase, town, options, now);
    logTownCount(count);
    counts.push(count);
  }

  const totals: TownCheckTotals = {
    towns: counts.length,
    checked: counts.filter((count) => count.status === 'checked').length,
    skipped: counts.filter((count) => count.status === 'skipped').length,
    failed: counts.filter((count) => count.status === 'failed').length,
    saved: counts.reduce((sum, count) => sum + (count.status === 'checked' ? count.saved : 0), 0),
  };
  console.log(
    `Scheduled check: ${totals.towns} towns, checked ${totals.checked}, skipped ${totals.skipped}, failed ${totals.failed}, saved ${totals.saved}`,
  );

  return { ok: true, towns: counts, totals };
}
