'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronRight, FileText, ListFilter, Sparkles } from 'lucide-react';
import LeafLoader from '../../components/art/LeafLoader';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import SignedOutNotice from '../../components/ui/SignedOutNotice';
import { documentsOfType } from './documentsOfType';
import { useDocuments, type DocumentListEntry } from './useDocuments';

type DocumentType = DocumentListEntry['document_type'];

// The schema's document types, in the order the type filter lists them.
const DOCUMENT_TYPES: DocumentType[] = ['Agenda', 'Packet', 'Minutes', 'Other'];

// Icon tile tint per type, the same tokens as the type badges on the meeting details page.
const TILE_CLASS: Record<DocumentType, string> = {
  Agenda: 'bg-accent-wash text-accent-strong',
  Packet: 'bg-info-soft/10 text-info-soft',
  Minutes: 'bg-warning/10 text-warning',
  Other: 'bg-raised text-fg-muted',
};

// MM/DD/YYYY. The list response has no town time zone, so this uses the viewer's.
function meetingDate(startAt: string | null): string {
  if (!startAt) return 'Date not available';
  return new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }).format(new Date(startAt));
}

// Summary status pill: Pending (SRS-206.2), Failed (SRS-210.3), Complete.
function StatusPill({ status }: { status: DocumentListEntry['summary_status'] }) {
  if (status === 'Pending') return <Badge tone="warning">Summary pending</Badge>;
  if (status === 'Failed') return <Badge tone="danger">Summary failed</Badge>;
  return (
    <Badge tone="success">
      <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
      Summary ready
    </Badge>
  );
}

// Documents page (SRS-201.1). Lists the documents from the user's followed towns, in the API's order.
export default function DocumentsPage() {
  const state = useDocuments();
  // Empty means All documents.
  const [selectedType, setSelectedType] = useState('');

  const documents = state.status === 'loaded' ? documentsOfType(state.documents, selectedType) : [];

  return (
    <main className="min-w-0 flex-1 p-4 text-fg sm:p-8">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.17em] text-accent">The public record</p>
      <h1 className="font-display text-4xl font-normal leading-tight tracking-tight sm:text-5xl">Documents</h1>
      <p className="mt-3 text-sm text-fg-muted">A little more context for the decisions happening around you.</p>

      {state.status === 'loading' ? (
        <LeafLoader className="mt-8" />
      ) : state.status === 'signedOut' ? (
        <SignedOutNotice className="mt-8" message="You must be logged in to view your documents." />
      ) : state.status === 'loadFailed' ? (
        <Alert tone="error" role="alert" className="mt-8">Your documents could not be loaded. Please try again.</Alert>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap gap-3">
            <label className="w-full sm:w-64">
              <span className="sr-only">Document type</span>
              <select
                value={selectedType}
                onChange={(event) => setSelectedType(event.target.value)}
                className="min-h-11 w-full rounded-md border border-line bg-card px-3 text-fg"
              >
                <option value="">All documents</option>
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-sm text-fg-muted">
            <p>{documents.length} {documents.length === 1 ? 'document' : 'documents'}</p>
            {/* GET /api/documents lists the newest retrieved first, and the page keeps that order. */}
            <p className="flex items-center gap-2">
              <ListFilter className="h-4 w-4" aria-hidden="true" />
              Newest first
            </p>
          </div>

          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card empty:border-0">
            {documents.map((doc) => (
              <li
                key={doc.document_id}
                className="relative flex min-h-[88px] items-center gap-3 break-words p-4 transition-colors hover:bg-raised md:gap-4 md:px-6 md:py-5"
              >
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${TILE_CLASS[doc.document_type] ?? TILE_CLASS.Other}`}
                  aria-hidden="true"
                >
                  <FileText className="h-5 w-5" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 sm:flex-1">
                    {/* The link covers the whole row, so the row opens the document (SRS-203.1). */}
                    <Link
                      href={`/documents/${doc.document_id}`}
                      className="font-semibold leading-relaxed text-fg after:absolute after:inset-0 hover:text-accent focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent"
                    >
                      {doc.title}
                    </Link>
                    <p className="mt-1 text-sm text-fg-muted">
                      {[doc.document_type, doc.town_name, meetingDate(doc.meeting_start_at)].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <StatusPill status={doc.summary_status} />
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-fg-muted" aria-hidden="true" />
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
