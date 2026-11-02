// Used when RETRIEVAL_MAX_PAGES is unset or invalid, so a missing setting can
// never mean unlimited (SRS-220.1).
const DEFAULT_MAX_PAGES = 2;
const RETRIEVAL_MAX_PAGES_CEILING = 5;

// The page bound for both source passes, read from the server setting only,
// never from the request.
export function retrievalMaxPages(): number {
  const setting = process.env.RETRIEVAL_MAX_PAGES?.trim() ?? '';
  const value = /^\d+$/.test(setting) ? Number(setting) : 0;

  return value < 1 ? DEFAULT_MAX_PAGES : Math.min(value, RETRIEVAL_MAX_PAGES_CEILING);
}
