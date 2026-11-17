// SRS-501.1: the dashboard shows the resident's upcoming matching meetings.
// The matching route returns every match, past ones included, sorted by start
// time; the dashboard keeps the upcoming ones that have a start time. It shows
// the first DASHBOARD_MEETING_LIMIT and offers the rest with "Show all".

export const DASHBOARD_MEETING_LIMIT = 6;

export function upcomingMeetings<T extends { start_at: string | null }>(
  meetings: T[],
  now: Date = new Date(),
  limit: number = DASHBOARD_MEETING_LIMIT,
): T[] {
  return meetings
    .filter((meeting) => meeting.start_at !== null && new Date(meeting.start_at) >= now)
    .slice(0, limit);
}

// SRS-501.2: a meeting's local start time as "09/24/2026 7:00 PM ET": the date
// as MM/DD/YYYY and the time in the town's time zone, with the zone's generic
// short name (ET, CT, PT…), which doesn't change between standard and daylight
// time. null when the time can't be read or the zone is unknown.
export function formatDashboardStart(startAt: string, timeZone: string): string | null {
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'shortGeneric',
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
    return `${part('month')}/${part('day')}/${part('year')} ${part('hour')}:${part('minute')} ${part('dayPeriod').toUpperCase()} ${part('timeZoneName')}`;
  } catch {
    return null;
  }
}
