'use client';

import Alert from '../../../components/ui/Alert';
import SignedOutNotice from '../../../components/ui/SignedOutNotice';
import DocumentSummary from './DocumentSummary';
import { useDocument } from './useDocument';

// Document detail page. Identification, the stored PDF shown in the page, and
// the summary (SRS-203.1, SRS-203.2, SRS-204.2).
export default function DocumentDetailPage({ params }: { params: { id: string } }) {
  const state = useDocument(params.id);

  return (
    <main className="min-w-0 flex-1 p-4 text-fg sm:p-8">
      <div className="mx-auto max-w-[960px]">
        {state.status === 'loading' ? (
          <p className="text-fg-subtle">Loading…</p>
        ) : state.status === 'signedOut' ? (
          <SignedOutNotice message="You must be logged in to view this document." />
        ) : state.status === 'notFound' ? (
          <>
            <h1 className="font-display text-3xl font-normal leading-tight tracking-tight sm:text-4xl">Document not found</h1>
            <p className="mt-3 text-fg-muted">No document exists at this address. Check the link and try again.</p>
          </>
        ) : state.status === 'loadFailed' ? (
          <Alert tone="error" role="alert">This document could not be loaded. Please try again.</Alert>
        ) : (
          <div className="space-y-6">
            <h1 className="break-words font-display text-2xl font-normal leading-tight tracking-tight sm:text-3xl">
              {state.document.title}
            </h1>

            <DocumentSummary text={state.document.summary_text} />

            {/* SRS-203.2 / SRS-205.1: the PDF stays inside the page, directly after the summary. */}
            {state.document.pdf_url ? (
              <iframe
                title="Document PDF"
                src={`${state.document.pdf_url}#page=1`}
                className="block h-[75vh] min-h-[420px] w-full rounded-xl border border-line bg-card shadow-sm"
              />
            ) : (
              <p className="text-fg-muted">The PDF is not available.</p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
