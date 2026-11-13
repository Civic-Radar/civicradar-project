import type { SupabaseClient } from './residentAuth';

// SRS-102.1, SRS-102.2, SRS-102.3: data freshness for each town the resident follows.

export type FollowedTown = { town_id: number; name: string; meeting_time_zone: string };

type CheckRow = {
  check_id: number;
  started_at: string;
  ended_at: string | null;
  changes_found: boolean | null;
  source_check_collections: { result: string }[] | null;
};

// How many finished checks are read per town to find the most recent successful one.
// The scheduled check runs every 3 hours, so this covers about 12 days.
export const CHECKS_READ_PER_TOWN = 100;

// The resident's followed towns that are still in the catalog, sorted by name.
export async function getFollowedTowns(supabase: SupabaseClient, userId: string): Promise<FollowedTown[] | null> {
  const { data: follows, error: followsError } = await supabase
    .from('user_followed_towns')
    .select('town_id')
    .eq('user_id', userId);
  if (followsError) return null;

  const townIds = ((follows ?? []) as { town_id: number }[]).map((row) => row.town_id);
  if (townIds.length === 0) return [];

  const { data: towns, error: townsError } = await supabase
    .from('towns')
    .select('town_id, name, meeting_time_zone')
    .in('town_id', townIds)
    .is('removed_at', null)
    .order('name');
  return townsError ? null : ((towns ?? []) as FollowedTown[]);
}

// A check is successful when it has ended and none of its collections Failed (Definition 10).
export function isSuccessfulCheck(check: CheckRow): boolean {
  if (!check.ended_at) return false;
  return !(check.source_check_collections ?? []).some((collection) => collection.result === 'Failed');
}

// The town's finished checks, most recent first (the same order as unsuccessful_check_towns).
export async function getFinishedChecks(supabase: SupabaseClient, townId: number): Promise<CheckRow[] | null> {
  const { data, error } = await supabase
    .from('source_checks')
    .select('check_id, started_at, ended_at, changes_found, source_check_collections(result)')
    .eq('town_id', townId)
    .not('ended_at', 'is', null)
    .order('started_at', { ascending: false })
    .order('check_id', { ascending: false })
    .limit(CHECKS_READ_PER_TOWN);
  return error ? null : ((data ?? []) as CheckRow[]);
}

// The time the most recent successful check ended, or null when there is none.
export function lastSuccessfulCheckAt(checks: CheckRow[]): string | null {
  return checks.find(isSuccessfulCheck)?.ended_at ?? null;
}

// SRS-102.2: true when the town's most recent finished check was not successful.
// A town with no finished check yet has nothing that failed, so it is false.
export function latestCheckFailed(checks: CheckRow[]): boolean {
  return checks.length > 0 && !isSuccessfulCheck(checks[0]);
}

// SRS-102.3: true when the town's most recent finished check was successful and found
// no new or changed records.
export function latestCheckFoundNothingNew(checks: CheckRow[]): boolean {
  return checks.length > 0 && isSuccessfulCheck(checks[0]) && checks[0].changes_found === false;
}

// "09/23/2026 2:00 PM ET": the date and time in the town's own time zone.
export function formatCheckTime(isoTime: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'shortGeneric',
  })
    .format(new Date(isoTime))
    .replace(',', '')
    .replace(/\s+/g, ' '); // some runtimes put a narrow no-break space before AM/PM
}