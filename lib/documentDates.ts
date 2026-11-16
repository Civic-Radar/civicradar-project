// SRS-202.2: each document's meeting date on the Documents list, as MM/DD/YYYY
// in the meeting's town time zone, never the viewer's. SRS-202.3: "Date not
// available" when there is no meeting start time.

export const DATE_NOT_AVAILABLE = 'Date not available';

// Every supported town meets in Massachusetts, so a town with no usable zone
// falls back to Eastern time rather than to the viewer's zone.
export const FALLBACK_TIME_ZONE = 'America/New_York';

function format(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', timeZone }).format(date);
}

/** The meeting date as MM/DD/YYYY in the town's time zone, or "Date not available". */
export function meetingDateLabel(startAt: string | null, timeZone: string | null): string {
  if (!startAt) return DATE_NOT_AVAILABLE;
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return DATE_NOT_AVAILABLE;
  if (timeZone) {
    try {
      return format(date, timeZone);
    } catch {
      // An unknown zone name throws a RangeError; use the fallback below.
    }
  }
  return format(date, FALLBACK_TIME_ZONE);
}
