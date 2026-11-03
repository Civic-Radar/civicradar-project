'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import Alert from '../../components/ui/Alert';
import { buttonClasses } from '../../components/ui/Button';
import PageShell from '../../components/ui/PageShell';
import SignedOutNotice from '../../components/ui/SignedOutNotice';
import { inputClasses } from '../../components/ui/TextField';
import { HIGHLIGHT_PARAM, type SearchResult } from '../../../lib/search';
import SearchResults from './SearchResults';

// Wait this long after the last keystroke before searching as the user types.
const TYPING_DELAY_MS = 250;
// Searching as you type starts at this many characters; Enter searches any length.
const MIN_LIVE_LENGTH = 2;

type Outcome =
  | { status: 'idle' }
  | { status: 'signedOut' }
  | { status: 'error' }
  | { status: 'done'; query: string; results: SearchResult[] };

// Keeps the current search in the address, so Back from a result returns to it.
function rememberQuery(query: string) {
  const url = new URL(window.location.href);
  if (query) url.searchParams.set(HIGHLIGHT_PARAM, query);
  else url.searchParams.delete(HIGHLIGHT_PARAM);
  window.history.replaceState(window.history.state, '', url.toString());
}

// SRS-506.1: a search field that accepts everyday-language queries.
// SRS-506.2: the search runs as the user types (after a short pause) or when they
// press Enter or Search. SRS-506.3: an empty or whitespace-only query never runs.
export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState<Outcome>({ status: 'idle' });
  const [searching, setSearching] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    // SRS-506.3: nothing to search for; the page stays as it is.
    if (trimmed === '') return;

    const token = localStorage.getItem('access_token');
    if (!token) {
      setOutcome({ status: 'signedOut' });
      return;
    }

    // A newer search replaces any one still running, so results always match the box.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setSearching(true);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (res.status === 401) {
        setOutcome({ status: 'signedOut' });
      } else {
        const data = await res.json();
        if (!res.ok || !Array.isArray(data.results)) setOutcome({ status: 'error' });
        else {
          setOutcome({ status: 'done', query: trimmed, results: data.results });
          rememberQuery(trimmed);
        }
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      setOutcome({ status: 'error' });
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setSearching(false);
      }
    }
  }, []);

  // Coming back to this page (for example with Back): restore the last search.
  useEffect(() => {
    const saved = new URLSearchParams(window.location.search).get(HIGHLIGHT_PARAM);
    if (saved) setQuery(saved);
  }, []);

  // Search as the user types, once they pause.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === '') {
      // Cleared box: stop any search and go back to the empty page.
      controllerRef.current?.abort();
      controllerRef.current = null;
      setSearching(false);
      setOutcome((current) => (current.status === 'signedOut' ? current : { status: 'idle' }));
      rememberQuery('');
      return;
    }
    if (trimmed.length < MIN_LIVE_LENGTH) return;

    const timer = setTimeout(() => runSearch(trimmed), TYPING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  // Stop a running search when leaving the page.
  useEffect(() => () => controllerRef.current?.abort(), []);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runSearch(query);
  }

  return (
    <PageShell title="Search">
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-fg-muted">
        Search meetings, documents, agenda items, and officials in plain words, like &ldquo;parking downtown&rdquo; or
        &ldquo;school budget&rdquo;. Results appear as you type.
      </p>

      <form role="search" onSubmit={handleSubmit} className="mt-6 flex max-w-3xl flex-col gap-3 sm:flex-row">
        <label className="flex-1">
          <span className="sr-only">Search</span>
          <span className="relative block">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
            <input
              type="search"
              name="q"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="What are you looking for?"
              autoComplete="off"
              aria-busy={searching}
              className={inputClasses('pl-9 pr-9')}
            />
            {searching ? (
              <Loader2
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-fg-subtle"
              />
            ) : null}
          </span>
        </label>
        <button type="submit" className={buttonClasses({ variant: 'primary', className: 'sm:min-w-28' })}>
          Search
        </button>
      </form>

      {outcome.status === 'signedOut' ? (
        <SignedOutNotice className="mt-8" message="You must be logged in to search." />
      ) : outcome.status === 'error' ? (
        <Alert tone="error" role="alert" className="mt-8">Search could not be completed. Please try again.</Alert>
      ) : outcome.status === 'done' ? (
        // Older results stay visible (dimmed) while newer ones load, so the list doesn't flicker.
        <div className={searching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          <p role="status" className="sr-only">
            {outcome.results.length} results for {outcome.query}
          </p>
          <SearchResults results={outcome.results} query={outcome.query} />
        </div>
      ) : searching ? (
        <p role="status" className="mt-8 text-sm text-fg-muted">Searching…</p>
      ) : null}
    </PageShell>
  );
}
