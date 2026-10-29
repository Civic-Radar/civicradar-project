// SRS-501.1: the dashboard shows the resident's upcoming matching meetings.
// The matching route returns every match, past ones included, sorted by start
// time; the dashboard keeps only the next few that have a start time.

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
