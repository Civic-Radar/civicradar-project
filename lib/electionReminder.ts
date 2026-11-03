// Landing page Election Day reminder (not an SRS requirement; a civic extra).
//
// The 2026 Massachusetts state election is Tuesday, November 3, 2026, and all
// polling places are open 7 a.m. to 8 p.m. Source: Secretary of the
// Commonwealth, "2026 Information for Voters"
// https://www.sec.state.ma.us/divisions/elections/research-and-statistics/2026-Information-for-voters/main.htm
// Update these values (or remove the reminder) for the next election.

export const ELECTION = {
  date: '2026-11-03', // Election Day, as YYYY-MM-DD in the state's time zone
  weekday: 'Tuesday',
  monthDay: 'November 3',
  state: 'Massachusetts',
  timeZone: 'America/New_York',
  pollHours: '7 a.m. to 8 p.m.', // ends with a period
  // The state's official elections and voting page.
  infoUrl: 'https://www.sec.state.ma.us/divisions/elections/elections-and-voting.htm',
  // How many days before Election Day the reminder starts showing.
  showDaysBefore: 7,
} as const;

export type ElectionReminder = { daysAway: number; headline: string; detail: string; url: string };

/** The calendar date (YYYY-MM-DD) of `now` in the given time zone. */
export function localDate(now: Date, timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Whole days from one YYYY-MM-DD date to another. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * What the reminder should say at `now`, or null when it should not show: from
 * `showDaysBefore` days before Election Day through the end of Election Day in
 * the state's time zone.
 */
export function electionReminder(now: Date, election = ELECTION): ElectionReminder | null {
  const today = localDate(now, election.timeZone);
  const daysAway = daysBetween(today, election.date);
  if (daysAway < 0 || daysAway > election.showDaysBefore) return null;

  const day = `${election.weekday}, ${election.monthDay}`;
  const headline =
    daysAway === 0
      ? `Today is Election Day in ${election.state}.`
      : daysAway === 1
        ? `Election Day is tomorrow, ${day}.`
        : `Election Day is ${day}.`;

  return { daysAway, headline, detail: `Polls are open ${election.pollHours}`, url: election.infoUrl };
}
