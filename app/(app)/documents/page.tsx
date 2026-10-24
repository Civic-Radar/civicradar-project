'use client';

import Link from 'next/link';
import { FileText } from 'lucide-react';
import Alert from '../../components/ui/Alert';
import PageShell from '../../components/ui/PageShell';
import SignedOutNotice from '../../components/ui/SignedOutNotice';
import { useDocuments } from './useDocuments';

// Documents page (SRS-201.1). Lists the documents from the user's followed towns by title.
export default function DocumentsPage() {
  const state = useDocuments();

  return (
    <PageShell title="Documents">
      {state.status === 'loading' ? (
        <p className="mt-8 text-fg-subtle">Loading…</p>
      ) : state.status === 'signedOut' ? (
        <SignedOutNotice className="mt-8" message="You must be logged in to view your documents." />
      ) : state.status === 'loadFailed' ? (
        <Alert tone="error" role="alert" className="mt-8">Your documents could not be loaded. Please try again.</Alert>
      ) : (
        <ul className="mt-8 divide-y divide-line overflow-hidden rounded-xl border border-line bg-card empty:border-0">
          {state.documents.map((doc) => (
            <li key={doc.document_id} className="flex min-h-[88px] items-center gap-3 break-words p-4 md:gap-4 md:p-5">
              <div className="flex h-12 w-10 shrink-0 items-center justify-center rounded-md border border-line bg-raised text-accent" aria-hidden="true">
                <FileText className="h-5 w-5" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1 text-xs">
                <Link href={`/documents/${doc.document_id}`} className="text-sm font-semibold leading-relaxed text-fg hover:text-accent hover:underline">{doc.title}</Link>
                {doc.town_name && <> <span className="text-fg-muted">{doc.town_name}</span></>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
