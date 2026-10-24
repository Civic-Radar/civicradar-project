'use client';

import Link from 'next/link';
import { useDocuments } from './useDocuments';

// Documents page (SRS-201.1). Lists the documents from the user's followed towns by title.
export default function DocumentsPage() {
  const state = useDocuments();

  return (
    <main className="px-6 py-10 text-fg">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold">Documents</h1>
        {state.status === 'loading' ? (
          <p className="mt-6 text-fg-subtle">Loading…</p>
        ) : state.status === 'signedOut' ? (
          <>
            <p className="mt-6 text-fg-muted">You must be logged in to view your documents.</p>
            <Link href="/login" className="mt-2 inline-block text-accent hover:underline">Go to login</Link>
          </>
        ) : state.status === 'loadFailed' ? (
          <p role="alert" className="mt-6 text-danger">Your documents could not be loaded. Please try again.</p>
        ) : (
          <ul className="mt-6 space-y-3">
            {state.documents.map((doc) => (
              <li key={doc.document_id} className="break-words">
                <Link href={`/documents/${doc.document_id}`} className="text-accent hover:underline">{doc.title}</Link>
                {doc.town_name && <> <span className="text-fg-muted">{doc.town_name}</span></>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
