// SRS-506.2, YA, Search submission / SRS-507.1, YA, Search results display.
// Pure helpers for the search across meetings, documents, agenda items, and
// officials: turning a query into search terms, and ranking the results.

export type SearchResultType = 'Meeting' | 'Document' | 'Agenda item' | 'Official';

export type SearchResult = {
  type: SearchResultType;
  // Unique within the list, e.g. "meeting-1192".
  key: string;
  title: string;
  detail: string | null;
  // SRS-507.2: the page the result opens.
  href: string;
  // How many search terms the result's text contains; higher ranks first.
  score: number;
};

const MAX_TERMS = 8;

// Everyday words that would match almost everything ("meetings about parking").
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'about', 'at', 'by', 'for', 'from', 'how', 'in', 'is', 'of', 'on', 'or', 'the', 'to',
  'what', 'when', 'where', 'who', 'with',
]);

/**
 * SRS-506.3: returns null for an empty or whitespace-only query, so no search runs.
 * Otherwise returns the lowercased words to search for (letters, digits, and
 * hyphens only, so they are safe inside a database filter). Common words are
 * dropped unless the query has nothing else.
 */
export function searchTerms(query: unknown): string[] | null {
  if (typeof query !== 'string' || query.trim() === '') return null;

  const words = query
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}-]/gu, '').replace(/^-+|-+$/g, ''))
    .filter((word) => word.length > 0);

  const meaningful = words.filter((word) => !STOP_WORDS.has(word));
  const chosen = meaningful.length > 0 ? meaningful : words;
  return [...new Set(chosen)].slice(0, MAX_TERMS);
}

/** A PostgREST "or" filter matching any term in any of the columns (case-insensitive). */
export function anyTermFilter(columns: string[], terms: string[]): string {
  return columns.flatMap((column) => terms.map((term) => `${column}.ilike.%${term}%`)).join(',');
}

/** How many of the terms appear in the given text (case-insensitive). */
export function termScore(texts: (string | null | undefined)[], terms: string[]): number {
  const haystack = texts.filter(Boolean).join(' ').toLowerCase();
  return terms.filter((term) => haystack.includes(term)).length;
}

const TYPE_ORDER: Record<SearchResultType, number> = { Meeting: 0, Document: 1, 'Agenda item': 2, Official: 3 };

/** Best matches first; ties keep a fixed type order, then title order. */
export function rankResults(results: SearchResult[]): SearchResult[] {
  return [...results].sort(
    (a, b) =>
      b.score - a.score ||
      TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
      a.title.localeCompare(b.title),
  );
}

// ---------------------------------------------------------------------------
// Highlighting the search words (results list and the page a result opens).

/** The query parameter that carries the search words to the opened page. */
export const HIGHLIGHT_PARAM = 'q';

/** A result's link, carrying the query so the opened page can highlight it. */
export function hrefWithQuery(href: string, query: string): string {
  const separator = href.includes('?') ? '&' : '?';
  return `${href}${separator}${HIGHLIGHT_PARAM}=${encodeURIComponent(query)}`;
}

/**
 * Where the terms appear in the text, as [start, end) character ranges in
 * order, case-insensitive, with overlapping or touching matches merged.
 */
export function matchRanges(text: string, terms: string[]): [number, number][] {
  if (!text || terms.length === 0) return [];
  const lower = text.toLowerCase();
  const found: [number, number][] = [];
  for (const term of terms) {
    if (!term) continue;
    let from = 0;
    for (;;) {
      const at = lower.indexOf(term, from);
      if (at === -1) break;
      found.push([at, at + term.length]);
      from = at + term.length;
    }
  }
  found.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: [number, number][] = [];
  for (const [start, end] of found) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}
