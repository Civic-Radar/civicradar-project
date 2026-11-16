'use client';

import { ArrowLeft } from 'lucide-react';

// SRS-203.4: the back control on the document detail page returns the user to
// the page they came from (the Documents page, a meeting details page or
// search results).
export default function BackControl() {
  return (
    <button
      type="button"
      onClick={() => window.history.back()}
      className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-fg-muted hover:text-fg hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Back
    </button>
  );
}
