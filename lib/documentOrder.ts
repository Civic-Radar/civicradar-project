// SRS-209.1: the Documents list is sorted by meeting date, newest first.
//
// Entries keep their incoming order when their meetings start at the same time
// (the route passes them newest retrieved first), and an entry with no meeting
// start time goes after every dated entry, so the order is always complete.
// SRS-209.2 and SRS-209.3 own those two rules.

type Dated = { meeting_start_at: string | null };

function startTime(entry: Dated): number | null {
  if (!entry.meeting_start_at) return null;
  const time = Date.parse(entry.meeting_start_at);
  return Number.isNaN(time) ? null : time;
}

/** The entries sorted by meeting start, newest first; a new array, the input is not changed. */
export function newestMeetingFirst<T extends Dated>(entries: T[]): T[] {
  return entries
    .map((entry, index) => ({ entry, index, time: startTime(entry) }))
    .sort((a, b) => {
      if (a.time !== null && b.time !== null && a.time !== b.time) return b.time - a.time;
      if (a.time === null && b.time !== null) return 1;
      if (a.time !== null && b.time === null) return -1;
      return a.index - b.index;
    })
    .map(({ entry }) => entry);
}
