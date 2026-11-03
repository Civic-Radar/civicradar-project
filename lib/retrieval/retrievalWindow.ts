import type { ListingWindow } from '../sources/types';

// Used when RETRIEVAL_WINDOW_DAYS_BACK or RETRIEVAL_WINDOW_DAYS_AHEAD is unset
// or invalid (SRS-220.1).
export const DEFAULT_WINDOW_DAYS_BACK = 90;
export const DEFAULT_WINDOW_DAYS_AHEAD = 30;
const MAX_WINDOW_DAYS = 365;

const DAY_MS = 24 * 60 * 60 * 1000;

// A whole number from 0 to 365, otherwise the default.
function windowDays(setting: string | undefined, fallback: number): number {
  const value = setting?.trim() ?? '';
  return /^\d+$/.test(value) && Number(value) <= MAX_WINDOW_DAYS ? Number(value) : fallback;
}

// 2026-10-01T00:00:00Z: an ISO UTC string without milliseconds.
function isoSeconds(time: number): string {
  return `${new Date(time).toISOString().slice(0, 19)}Z`;
}

// The retrieval window around now (SRS-220.1): from the start of the UTC day
// the back days before now to the end of the UTC day the ahead days after now.
// The day counts come from the server settings only, never from the request.
export function retrievalWindow(now: Date, env: NodeJS.ProcessEnv = process.env): ListingWindow {
  const back = windowDays(env.RETRIEVAL_WINDOW_DAYS_BACK, DEFAULT_WINDOW_DAYS_BACK);
  const ahead = windowDays(env.RETRIEVAL_WINDOW_DAYS_AHEAD, DEFAULT_WINDOW_DAYS_AHEAD);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return {
    from: isoSeconds(today - back * DAY_MS),
    to: isoSeconds(today + (ahead + 1) * DAY_MS - 1000),
  };
}
