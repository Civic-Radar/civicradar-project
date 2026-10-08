import type { SupabaseClient } from '@supabase/supabase-js';
import type { SourceMeeting } from '../sources/types';

// The towns columns saveMeetings needs. towns is read only here.
export interface RetrievalTown {
  town_id: number;
  meeting_time_zone: string;
}

// Wall-clock date and time, with an optional trailing "Z" that does not mean UTC.
const WALL_CLOCK_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?Z?$/;

// Milliseconds the time zone's wall clock is ahead of UTC at the given instant.
function zoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const wallClock = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));

  return wallClock - Math.floor(instant / 1000) * 1000;
}

// The source's time is local wall-clock time in the town's meeting time zone,
// even though it ends in "Z" (SRS-220.6). Returns null when it cannot be parsed.
export function toStartAt(sourceStartTime: string | null, timeZone: string): string | null {
  const match = sourceStartTime?.match(WALL_CLOCK_PATTERN);
  if (!match) {
    return null;
  }

  const [year, month, day, hour, minute, second = '0'] = match.slice(1, 7).map((part) => part ?? '0');
  const millisecond = (match[7] ?? '').padEnd(3, '0');
  const wallClock = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second, +millisecond);

  // Date.UTC rolls invalid values over (e.g. Feb 30), so reject anything that changed.
  const check = new Date(wallClock);
  if (
    Number.isNaN(wallClock) ||
    check.getUTCFullYear() !== +year ||
    check.getUTCMonth() !== +month - 1 ||
    check.getUTCDate() !== +day ||
    check.getUTCHours() !== +hour ||
    check.getUTCMinutes() !== +minute ||
    check.getUTCSeconds() !== +second
  ) {
    return null;
  }

  // Second pass picks up a daylight saving change between the guess and the answer.
  const firstGuess = wallClock - zoneOffset(wallClock, timeZone);
  return new Date(wallClock - zoneOffset(firstGuess, timeZone)).toISOString();
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

// Maps each body name in the town's catalog to its body_id, or to null when
// more than one non-removed body shares the name. governing_bodies is read only.
async function loadBodyIds(supabase: SupabaseClient, townId: number): Promise<Map<string, number | null>> {
  const { data, error } = await supabase
    .from('governing_bodies')
    .select('body_id, name')
    .eq('town_id', townId)
    .is('removed_at', null);

  if (error) {
    throw new Error(`Could not read governing bodies: ${error.message}`);
  }

  const bodyIds = new Map<string, number | null>();
  for (const body of data ?? []) {
    const key = normalizeName(body.name);
    bodyIds.set(key, bodyIds.has(key) ? null : body.body_id);
  }
  return bodyIds;
}

// Saves retrieved meetings to the meetings table (SRS-220.3). Upserts on
// (town_id, source_meeting_id) so a repeat run updates instead of adding rows.
// Omitted values are stored as null (SRS-220.4). Returns the number of rows upserted.
// Recording links are not stored here: SourceMeeting has no recording field and Salem's provides_recordings is FALSE (SRS-220.10).
export async function saveMeetings(
  supabase: SupabaseClient,
  town: RetrievalTown,
  meetings: SourceMeeting[],
): Promise<number> {
  if (meetings.length === 0) {
    return 0;
  }

  const bodyIds = await loadBodyIds(supabase, town.town_id);

  const rows = meetings.map((meeting) => ({
    town_id: town.town_id,
    source_meeting_id: meeting.sourceMeetingId,
    title: meeting.title,
    body_id: meeting.sourceBodyName === null ? null : bodyIds.get(normalizeName(meeting.sourceBodyName)) ?? null,
    source_body_id: meeting.sourceBodyId,
    source_body_name: meeting.sourceBodyName,
    source_start_time: meeting.sourceStartTime,
    start_at: toStartAt(meeting.sourceStartTime, town.meeting_time_zone),
    location: meeting.location,
    online_link: meeting.onlineLink,
    source_url: meeting.sourceUrl,
  }));

  const { data, error } = await supabase
    .from('meetings')
    .upsert(rows, { onConflict: 'town_id,source_meeting_id' })
    .select('meeting_id');

  if (error) {
    throw new Error(`Could not save meetings: ${error.message}`);
  }

  return data?.length ?? 0;
}
