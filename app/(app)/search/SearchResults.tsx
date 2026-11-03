'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import EmptyArt from '../../components/art/EmptyArt';
import Badge, { type BadgeTone } from '../../components/ui/Badge';
import { hrefWithQuery, matchRanges, searchTerms, type SearchResult, type SearchResultType } from '../../../lib/search';

// SRS-507.3: shown when a completed search returns zero results.
export const NO_RESULTS = 'No results found.';

const TYPES: SearchResultType[] = ['Meeting', 'Document', 'Agenda item', 'Official'];

const PLURAL: Record<SearchResultType, string> = {
  Meeting: 'Meetings',
  Document: 'Documents',
  'Agenda item': 'Agenda items',
  Official: 'Officials',
};

const TONE: Record<SearchResultType, BadgeTone> = {
  Meeting: 'success',
  Document: 'info',
  'Agenda item': 'warning',
  Official: 'neutral',
};

/**
 * SRS-507.1: lists the results, each labeled Meeting, Document, Agenda item, or Official.
 * SRS-507.2: selecting a result opens its page.
 * The type buttons narrow the list to one kind (UR-507, "an organized format").
 * The searched words are highlighted, and each link carries the query so the
 * opened page highlights them too (see SearchHighlight).
 */
export default function SearchResults({ results, query = '' }: { results: SearchResult[]; query?: string }) {
  const [shown, setShown] = useState<SearchResultType | 'All'>('All');
  const terms = searchTerms(query) ?? [];

  if (results.length === 0) {
    return (
      <div className="mt-8 flex flex-col items-center gap-3 px-6 py-14 text-center text-fg-muted">
        <EmptyArt scene="board" />
        <p className="text-base font-semibold text-fg">{NO_RESULTS}</p>
        <p className="max-w-sm text-sm">Try fewer words, or check the spelling.</p>
      </div>
    );
  }

  const counts = TYPES.map((type) => [type, results.filter((r) => r.type === type).length] as const);
  const visible = shown === 'All' ? results : results.filter((r) => r.type === shown);

  return (
    <section aria-label="Search results" className="mt-8">
      <div role="group" aria-label="Show result type" className="mb-4 flex flex-wrap gap-2">
        <FilterButton label={`All (${results.length})`} active={shown === 'All'} onClick={() => setShown('All')} />
        {counts
          .filter(([, count]) => count > 0)
          .map(([type, count]) => (
            <FilterButton
              key={type}
              label={`${PLURAL[type]} (${count})`}
              active={shown === type}
              onClick={() => setShown(type)}
            />
          ))}
      </div>

      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
        {visible.map((result) => (
          <li key={result.key}>
            <Link
              href={query ? hrefWithQuery(result.href, query) : result.href}
              className="group flex items-start gap-4 px-5 py-4 transition hover:bg-raised focus:outline-none focus-visible:bg-raised focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
            >
              <div className="min-w-0 flex-1">
                <Badge tone={TONE[result.type]}>{result.type}</Badge>
                <p className="mt-2 break-words font-semibold leading-snug text-fg group-hover:underline">
                  <Highlighted text={result.title} terms={terms} />
                </p>
                {result.detail ? (
                  <p className="mt-1 break-words text-sm text-fg-muted">
                    <Highlighted text={result.detail} terms={terms} />
                  </p>
                ) : null}
              </div>
              <ArrowUpRight aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-fg-subtle" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The text with each searched word wrapped in <mark>. */
function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  const ranges = matchRanges(text, terms);
  if (ranges.length === 0) return <>{text}</>;

  const pieces: React.ReactNode[] = [];
  let at = 0;
  ranges.forEach(([start, end], index) => {
    if (start > at) pieces.push(text.slice(at, start));
    pieces.push(
      <mark key={index} className="rounded-sm bg-lime px-0.5 text-fg">
        {text.slice(start, end)}
      </mark>,
    );
    at = end;
  });
  if (at < text.length) pieces.push(text.slice(at));
  return <>{pieces}</>;
}

function FilterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-9 rounded-full border px-3.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        active ? 'border-accent-strong bg-accent-strong text-on-dark' : 'border-line bg-card text-fg hover:bg-raised'
      }`}
    >
      {label}
    </button>
  );
}
