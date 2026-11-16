// SRS-209.4: the Documents list is split into upcoming and past meetings.
//
// "Today" and each meeting date are calendar dates in the meeting's town time
// zone, the same dates the list shows (SRS-202.2), so a meeting later today is
// still upcoming. Upcoming is soonest first; past is most recent first.
// Documents of the same meeting keep their incoming order (newest retrieved
// first, SRS-209.2), and documents with no meeting date go at the end of the
// past list (SRS-209.3).

import { FALLBACK_TIME_ZONE } from './documentDates';

export type MeetingList = 'upcoming' | 'past';

type Dated = { meeting_start_at: string | null; meeting_time_zone: string | null };

/** YYYY-MM-DD of the instant in the given zone (Eastern when the zone is missing or not valid). */
export function calendarDate(instant: Date, timeZone: string | null): string {
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
  if (timeZone) {
    try {
      return format(timeZone);
    } catch {
      // An unknown zone name throws a RangeError; use the fallback below.
    }
  }
  return format(FALLBACK_TIME_ZONE);
}

/** The documents split into the upcoming and past lists, each in its order. New arrays; the input is not changed. */
export function splitByMeetingDate<T extends Dated>(documents: T[], now: Date = new Date()): Record<MeetingList, T[]> {
  type Row = { doc: T; index: number; time: number };
  const upcoming: Row[] = [];
  const past: Row[] = [];
  const undated: T[] = [];

  documents.forEach((doc, index) => {
    const time = doc.meeting_start_at ? Date.parse(doc.meeting_start_at) : Number.NaN;
    if (Number.isNaN(time)) {
      undated.push(doc);
      return;
    }
    const meetingDay = calendarDate(new Date(time), doc.meeting_time_zone);
    const today = calendarDate(now, doc.meeting_time_zone);
    (meetingDay >= today ? upcoming : past).push({ doc, index, time });
  });

  upcoming.sort((a, b) => a.time - b.time || a.index - b.index);
  past.sort((a, b) => b.time - a.time || a.index - b.index);

  return {
    upcoming: upcoming.map((row) => row.doc),
    past: [...past.map((row) => row.doc), ...undated],
  };
}
