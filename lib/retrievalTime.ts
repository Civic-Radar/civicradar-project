// How long ago a document was retrieved (UR-215).

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function count(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

// SRS-215.1: "Retrieved N minutes ago" under 60 minutes, "Retrieved N hours ago"
// under 24 hours, otherwise "Retrieved N days ago", each rounded down. A time
// a little in the future (a clock ahead of the server) counts as 0 minutes.
// Null when retrieved_at is not a time.
export function retrievedAgo(retrievedAt: string | null, now: number = Date.now()): string | null {
  const time = retrievedAt ? Date.parse(retrievedAt) : NaN;
  if (Number.isNaN(time)) return null;
  const elapsed = Math.max(0, now - time);
  if (elapsed < HOUR_MS) return `Retrieved ${count(Math.floor(elapsed / MINUTE_MS), 'minute')} ago`;
  if (elapsed < DAY_MS) return `Retrieved ${count(Math.floor(elapsed / HOUR_MS), 'hour')} ago`;
  return `Retrieved ${count(Math.floor(elapsed / DAY_MS), 'day')} ago`;
}
