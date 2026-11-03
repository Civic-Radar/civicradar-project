// Used when RETRIEVAL_MAX_PAGES is unset or invalid, so a missing setting can
// never mean unlimited (SRS-220.1). The setting can only lower the bound.
const DEFAULT_MAX_PAGES = 20;
const RETRIEVAL_MAX_PAGES_CEILING = 20;

// The page bound for both source passes, read from the server setting only,
// never from the request. A value that is not a whole number from 1 to the
// ceiling gives the default.
export function retrievalMaxPages(): number {
  const setting = process.env.RETRIEVAL_MAX_PAGES?.trim() ?? '';
  const value = /^\d+$/.test(setting) ? Number(setting) : 0;

  return value >= 1 && value <= RETRIEVAL_MAX_PAGES_CEILING ? value : DEFAULT_MAX_PAGES;
}
