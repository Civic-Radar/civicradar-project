// SRS-220.11: the meetings page lists upcoming or past meetings.
//
// "Today" and each meeting's date are calendar dates in the meeting's town
// time zone, the same dates the rows show, so a meeting later today is still
// upcoming. Upcoming is soonest first; past is most recent first, with the
// meetings that have no parsed start time at the end.

export type MeetingTimeList = 'upcoming' | 'past';

// Every supported town meets in Massachusetts, so a missing or unknown zone
// falls back to Eastern time rather than to the viewer's zone.
const FALLBACK_TIME_ZONE = 'America/New_York';

type Dated = { town_id: number; start_at: string | null };

// Creating an Intl.DateTimeFormat is slow, so one is made per time zone and reused.
// An unknown zone is remembered as the fallback zone's formatter.
const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dayFormatters.get(timeZone);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      // An unknown zone name throws a RangeError.
      formatter = dayFormatter(FALLBACK_TIME_ZONE);
    }
    dayFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** YYYY-MM-DD of the instant in the given zone (Eastern when the zone is missing or not valid). */
export function calendarDate(instant: Date, timeZone: string | null | undefined): string {
  return dayFormatter(timeZone || FALLBACK_TIME_ZONE).format(instant);
}

/**
 * The meetings split into the upcoming and past lists, each in its order.
 * timeZoneOf gives a meeting's town time zone. New arrays; the input is not changed.
 */
export function splitMeetingsByDate<T extends Dated>(
  meetings: T[],
  timeZoneOf: (townId: number) => string | null | undefined,
  now: Date = new Date(),
): Record<MeetingTimeList, T[]> {
  type Row = { meeting: T; index: number; time: number };
  const upcoming: Row[] = [];
  const past: Row[] = [];
  const undated: T[] = [];

  // Today's date is worked out once per zone, not once per meeting.
  const todayByZone = new Map<string, string>();
  meetings.forEach((meeting, index) => {
    const time = meeting.start_at ? Date.parse(meeting.start_at) : Number.NaN;
    if (Number.isNaN(time)) {
      undated.push(meeting);
      return;
    }
    const zone = timeZoneOf(meeting.town_id) || FALLBACK_TIME_ZONE;
    let today = todayByZone.get(zone);
    if (today === undefined) {
      today = calendarDate(now, zone);
      todayByZone.set(zone, today);
    }
    (calendarDate(new Date(time), zone) >= today ? upcoming : past).push({ meeting, index, time });
  });

  upcoming.sort((a, b) => a.time - b.time || a.index - b.index);
  past.sort((a, b) => b.time - a.time || a.index - b.index);

  return {
    upcoming: upcoming.map((row) => row.meeting),
    past: [...past.map((row) => row.meeting), ...undated],
  };
}
