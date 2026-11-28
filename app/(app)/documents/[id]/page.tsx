'use client';

import LeafLoader from '../../../components/art/LeafLoader';
import Alert from '../../../components/ui/Alert';
import SignedOutNotice from '../../../components/ui/SignedOutNotice';
import BackControl from './BackControl';
import DocumentSummary from './DocumentSummary';
import DownloadPdfButton from './DownloadPdfButton';
import { useDocument } from './useDocument';
import { retrievedAtEastern } from '../../../../lib/retrievalTime';

// Document detail page. Identification, the stored PDF shown in the page, and
// the summary or the Failed message (SRS-203.1, SRS-203.2, SRS-204.2, SRS-210.2).
// The Back control (SRS-203.4) shows above every state of the page.
export default function DocumentDetailPage({ params }: { params: { id: string } }) {
  const state = useDocument(params.id);

  return (
    <main className="min-w-0 flex-1 p-4 text-fg sm:p-8">
      <div className="mx-auto max-w-[960px]">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <BackControl />
          {/* SRS-214.1: Download PDF on every document's page, enabled when there is a stored PDF. */}
          {state.status === 'loaded' ? (
            <DownloadPdfButton documentId={state.document.document_id} available={Boolean(state.document.pdf_url)} />
          ) : null}
        </div>
        {state.status === 'loading' ? (
          <LeafLoader />
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
            {/* SRS-215.2: the exact retrieval time, in Eastern time, just above the title. */}
            <p className="-mb-4 text-sm text-fg-muted">{retrievedAtEastern(state.document.retrieved_at)}</p>
            <h1 className="break-words font-display text-2xl font-normal leading-tight tracking-tight sm:text-3xl">
              {state.document.title}
            </h1>

            {/* SRS-207.4: the label is the exact SRS wording; towns that use another source would need that platform's name. */}
            {typeof state.document.source_url === 'string' && /^https?:\/\//.test(state.document.source_url) ? (
              <p>
                <a href={state.document.source_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Open on CivicClerk</a>
              </p>
            ) : null}

            <DocumentSummary
              text={state.document.summary_text}
              sourcePdfUrl={state.document.pdf_url}
              summaryStatus={state.document.summary_status}
            />

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
