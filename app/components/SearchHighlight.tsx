'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { HIGHLIGHT_PARAM, matchRanges, searchTerms } from '../../lib/search';

// Names used by the ::highlight() rules in app/globals.css.
const ALL_MATCHES = 'search-match';
const CURRENT_MATCH = 'search-current';

// Text inside these is never highlighted.
const SKIP = 'script, style, textarea, input, select, [aria-hidden="true"], [data-no-highlight]';

// The CSS Custom Highlight API marks text without changing the page's DOM, so
// it cannot disturb React. Browsers without it simply show no highlighting.
function highlightSupported(): boolean {
  return typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';
}

function readQuery(): string {
  return new URLSearchParams(window.location.search).get(HIGHLIGHT_PARAM) ?? '';
}

/** A Range for every place the terms appear in the text under root. */
function findRanges(root: HTMLElement, terms: string[]): Range[] {
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue ?? '';
    for (const [start, end] of matchRanges(text, terms)) {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      ranges.push(range);
    }
  }
  return ranges;
}

function scrollToRange(range: Range) {
  const rect = range.getBoundingClientRect();
  window.scrollBy({ top: rect.top - window.innerHeight / 3, behavior: 'smooth' });
}

/**
 * Wraps the page content. When the address has ?q=<search words> (set by a
 * search result link), every match on the page is highlighted, the first is
 * scrolled into view, and a bar offers Next and Clear. Pages that load their
 * content later are re-scanned as the content appears.
 */
export default function SearchHighlight({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const areaRef = useRef<HTMLDivElement>(null);
  const rangesRef = useRef<Range[]>([]);
  const scrolledRef = useRef(false);
  const [query, setQuery] = useState('');
  const [count, setCount] = useState(0);
  const [current, setCurrent] = useState(0);

  // Read the words from the address on every page change. The Search page keeps
  // its own query in the address and highlights its results itself, so skip it.
  useEffect(() => {
    setQuery(pathname === '/search' ? '' : readQuery());
    setCurrent(0);
    scrolledRef.current = false;
  }, [pathname]);

  const showCurrent = useCallback((index: number) => {
    if (!highlightSupported()) return;
    const range = rangesRef.current[index];
    if (range) {
      const highlight = new Highlight(range);
      // Drawn above the other matches so the current one stands out.
      highlight.priority = 1;
      CSS.highlights.set(CURRENT_MATCH, highlight);
      scrollToRange(range);
    }
  }, []);

  useEffect(() => {
    const area = areaRef.current;
    const terms = searchTerms(query);
    if (!area || !terms || terms.length === 0 || !highlightSupported()) {
      setCount(0);
      return;
    }

    const apply = () => {
      const ranges = findRanges(area, terms);
      rangesRef.current = ranges;
      CSS.highlights.set(ALL_MATCHES, new Highlight(...ranges));
      setCount(ranges.length);
      if (!scrolledRef.current && ranges.length > 0) {
        scrolledRef.current = true;
        showCurrent(0);
      }
    };

    apply();
    // Pages load their data after the first render; scan again when content changes.
    let frame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    });
    observer.observe(area, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      CSS.highlights.delete(ALL_MATCHES);
      CSS.highlights.delete(CURRENT_MATCH);
    };
  }, [query, pathname, showCurrent]);

  function next() {
    if (count === 0) return;
    const index = (current + 1) % count;
    setCurrent(index);
    showCurrent(index);
  }

  function clear() {
    const url = new URL(window.location.href);
    url.searchParams.delete(HIGHLIGHT_PARAM);
    window.history.replaceState(window.history.state, '', url.toString());
    setQuery('');
  }

  const active = query.trim() !== '' && highlightSupported();

  return (
    <>
      <div ref={areaRef}>{children}</div>

      {active ? (
        <div
          role="status"
          data-search-highlight-bar
          className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-card py-1.5 pl-4 pr-1.5 text-sm text-fg shadow-lg"
        >
          <span className="truncate">
            {count === 0 ? (
              <>No matches for <strong>&ldquo;{query}&rdquo;</strong> on this page</>
            ) : (
              <>
                {count > 1 ? `${current + 1} of ${count}` : '1'} match{count === 1 ? '' : 'es'} for{' '}
                <strong>&ldquo;{query}&rdquo;</strong>
              </>
            )}
          </span>
          {count > 1 ? (
            <button
              type="button"
              onClick={next}
              aria-label="Next match"
              className="ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={clear}
            aria-label="Clear highlighting"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </>
  );
}
