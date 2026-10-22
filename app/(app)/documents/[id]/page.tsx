'use client';

import Link from 'next/link';
import DocumentSummary from './DocumentSummary';
import { useDocument } from './useDocument';

// Document detail page. Identification and summary (SRS-203.1, SRS-204.2).
export default function DocumentDetailPage({ params }: { params: { id: string } }) {
  const state = useDocument(params.id);

  return (
    <main className="px-6 py-10 text-fg">
      <div className="mx-auto max-w-3xl">
        {state.status === 'loading' ? (
          <p className="text-fg-subtle">Loading…</p>
        ) : state.status === 'signedOut' ? (
          <>
            <p className="text-fg-muted">You must be logged in to view this document.</p>
            <Link href="/login" className="mt-2 inline-block text-accent hover:underline">Go to login</Link>
          </>
        ) : state.status === 'notFound' ? (
          <>
            <h1 className="text-2xl font-semibold">Document not found</h1>
            <p className="mt-2 text-fg-muted">No document exists at this address. Check the link and try again.</p>
          </>
        ) : state.status === 'loadFailed' ? (
          <p role="alert" className="text-danger">This document could not be loaded. Please try again.</p>
        ) : (
          <>
            <h1 className="break-words text-3xl font-semibold">{state.document.title}</h1>
            <DocumentSummary text={state.document.summary_text} />
          </>
        )}
      </div>
    </main>
  );
}
