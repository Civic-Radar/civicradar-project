'use client';

import { ArrowLeft } from 'lucide-react';

// Where Back goes when the detail page has no earlier page in this tab.
export const BACK_FALLBACK = '/documents';

type BrowserHistory = Pick<History, 'length' | 'back'>;

/**
 * SRS-203.4: goes back one step in the browser history, so the user returns to
 * whichever page opened the document (the Documents page, a meeting details
 * page or search results). A detail page opened in a new tab or from a pasted
 * link has no earlier page (history length 1), so it opens the Documents page.
 */
export function returnToPreviousPage(history: BrowserHistory, open: (href: string) => void): void {
  if (history.length > 1) history.back();
  else open(BACK_FALLBACK);
}

// The back control on the document detail page (SRS-203.4).
export default function BackControl() {
  return (
    <button
      type="button"
      onClick={() => returnToPreviousPage(window.history, (href) => window.location.assign(href))}
      className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-fg-muted hover:text-fg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Back
    </button>
  );
}
