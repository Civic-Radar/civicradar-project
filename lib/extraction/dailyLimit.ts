// SRS-301.7, AO, Daily extraction limit.
// "The system shall refuse a new extraction request ... when the signed-in user
//  has already requested the daily limit of extractions (10 by default) that day."
//
// Every extraction calls the Claude API on the project's key, so the number of
// requests each user can make per day is capped. The limit can be changed with
// EXTRACTION_DAILY_LIMIT in .env.local. A "day" is a calendar day in the pilot
// municipality's time zone (Salem, MA), starting at midnight.
import type { SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_DAILY_EXTRACTION_LIMIT = 10;
export const PILOT_TIME_ZONE = 'America/New_York';

export function dailyExtractionLimit(): number {
  const limit = Number(process.env.EXTRACTION_DAILY_LIMIT);
  return Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_DAILY_EXTRACTION_LIMIT;
}

// How far the time zone's clock is ahead of UTC at a given moment, in ms.
function offsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - Math.floor(instant / 1000) * 1000;
}

// Midnight at the start of `now`'s calendar day in the time zone, as a UTC Date.
export function startOfDay(now: Date, timeZone = PILOT_TIME_ZONE): Date {
  const local = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [year, month, day] = local.split('-').map(Number);
  const midnightAsUtc = Date.UTC(year, month - 1, day);
  // Correct for the zone's offset at that midnight (twice, so a DST change that day is handled).
  let start = midnightAsUtc - offsetMs(midnightAsUtc, timeZone);
  start = midnightAsUtc - offsetMs(start, timeZone);
  return new Date(start);
}

// How many extraction requests the user has made today. null if it can't be counted.
export async function extractionRequestsToday(supabase: SupabaseClient, userId: string, now = new Date()): Promise<number | null> {
  const { count, error } = await supabase
    .from('extractions')
    .select('extraction_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('requested_at', startOfDay(now).toISOString());
  if (error) return null;
  return count ?? 0;
}
