'use client';

// Saved Extractions page — SRS-304.1, AO, Saved extraction list.
// "The system shall list the signed-in user's saved extractions, with each one's
//  source document title and extraction date, when the user opens the Saved
//  Extractions page."
//
// A saved extraction is one that completed and has stored results. Each entry
// opens its results (/extractions/<id>), which are read from the database, so no
// new extraction runs.
//
// Task 304.1-5 (beyond the SRS wording, noted on issue #202): each entry also
// shows how many officials it found, and a search box filters by document title.
//
// SRS-305.2, AO, Deletion confirmation: selecting Delete on an extraction asks
// the user to confirm, naming its source document.
//
// SRS-305.4, AO, Permanent deletion: confirming deletes the extraction for good;
// it leaves the list and its page can no longer be opened.

import Link from 'next/link';
import { FolderOpen, Search } from 'lucide-react';
import ContactsTabs from '../../components/ContactsTabs';
import { useEffect, useState } from 'react';
import { alertClasses } from '../../components/ui/Alert';
import { buttonClasses } from '../../components/ui/Button';
import { cardClasses } from '../../components/ui/Card';
import SignedOutNotice from '../../components/ui/SignedOutNotice';
import { deletionConfirmationMessage, extractionDate, filterSavedExtractions, formatDateTime, officialsFoundLabel } from '../../../lib/extractions';
import type { SavedExtraction } from '../../../lib/extractions';

export default function SavedExtractionsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [extractions, setExtractions] = useState<SavedExtraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Task 304.1-5: search the saved extractions by source document title.
  const [search, setSearch] = useState('');
  const shown = filterSavedExtractions(extractions, search);
  // SRS-305.2: the saved extraction whose Delete control was selected.
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // SRS-305.4: confirming deletes the extraction for good and removes it from the list.
  async function deleteExtraction(extractionId: number) {
    if (!token) return;
    setDeleting(true);
    setError('');
    const res = await fetch(`/api/extractions/${extractionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => null);
    setDeleting(false);

    if (!res?.ok) {
      const data = res ? await res.json().catch(() => ({})) : {};
      setError(data.error || 'The extraction could not be deleted.');
      return;
    }
    setConfirmingId(null);
    setExtractions((list) => list.filter((e) => e.extraction_id !== extractionId));
  }

  useEffect(() => {
    const stored = localStorage.getItem('access_token');
    setToken(stored);
    if (!stored) { setLoading(false); return; }

    fetch('/api/extractions?saved=1', { headers: { Authorization: `Bearer ${stored}` }, cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (res.status === 401) {
          localStorage.removeItem('access_token');
          setToken(null);
        } else if (!res.ok) {
          setError(data.error || 'Could not load your saved extractions.');
        } else {
          setExtractions(data.extractions);
        }
      })
      .catch(() => setError('Could not load your saved extractions.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="min-w-0 flex-1 p-4 text-fg sm:p-8">
        <p className="text-fg-muted">Loading…</p>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="min-w-0 flex-1 p-4 text-fg sm:p-8">
        <SignedOutNotice message="You must be logged in to view your saved extractions." />
      </main>
    );
  }

  return (
    <main className="min-w-0 flex-1 p-4 text-fg sm:p-8">
      <div className="mx-auto w-full max-w-[900px] space-y-6">
        <header>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.17em] text-accent">Officials &amp; Contacts</p>
          <h1 className="font-display text-3xl font-normal leading-tight tracking-tight sm:text-4xl">Saved extractions</h1>
          <p className="mt-3 text-sm leading-relaxed text-fg-muted">Every extraction you&apos;ve completed, with the officials it found.</p>
        </header>

        <ContactsTabs />

        {error ? <p role="alert" className={alertClasses('error')}>{error}</p> : null}

        <section className={cardClasses('sm:p-7')}>
          {extractions.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 px-6 py-16 text-center text-fg-muted">
              <FolderOpen aria-hidden="true" className="h-[30px] w-[30px] text-accent" />
              <p className="max-w-[450px] text-sm leading-relaxed">
                You don&apos;t have any saved extractions yet. Request one on the{' '}
                <Link href="/extract" className="text-accent hover:underline">Request</Link> tab.
              </p>
            </div>
          ) : (
            <>
              {/* Task 304.1-5: search by document title */}
              <label htmlFor="saved-search" className="sr-only">Search saved extractions</label>
              <div className="flex items-center gap-2 rounded-md border border-line bg-card pl-4 transition focus-within:border-accent focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
                <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-fg-muted" />
                <input
                  id="saved-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by document title"
                  className="min-h-12 w-full min-w-0 border-0 bg-transparent py-3 pr-3 text-sm text-fg outline-none placeholder:text-fg-subtle"
                />
              </div>
              <p className="mt-4 text-xs leading-relaxed text-fg-muted">
                {shown.length} of {extractions.length} saved {extractions.length === 1 ? 'extraction' : 'extractions'}
              </p>

              {shown.length === 0 ? (
                <p className="mt-4 text-sm text-fg-muted">No saved extractions match &ldquo;{search.trim()}&rdquo;.</p>
              ) : null}

              <ul className="mt-2 divide-y divide-line" aria-label="Saved extractions">
                {shown.map((e) => (
                  <li key={e.extraction_id} data-testid="saved-extraction" className="py-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Link
                        href={`/extractions/${e.extraction_id}`}
                        className="-mx-3 min-w-0 flex-1 rounded-md px-3 py-3 transition hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        <p className="break-words text-sm font-medium">{e.source_document_title}</p>
                        <p className="mt-2 text-xs leading-relaxed text-fg-muted">
                          Extracted {formatDateTime(extractionDate(e))} · {officialsFoundLabel(e.officials_found)}
                        </p>
                      </Link>
                      {/* SRS-305.2: a Delete control on each saved extraction */}
                      <button
                        type="button"
                        onClick={() => setConfirmingId(e.extraction_id)}
                        aria-label={`Delete the extraction of ${e.source_document_title}`}
                        className={buttonClasses({ variant: 'secondary', className: 'hover:border-danger-line hover:text-danger' })}
                      >
                        Delete
                      </button>
                    </div>

                    {/* SRS-305.2: confirm the deletion, naming the source document */}
                    {confirmingId === e.extraction_id ? (
                      <div role="alertdialog" aria-label="Confirm deletion" className={alertClasses('error', 'mt-3')}>
                        <p data-testid="delete-confirmation">{deletionConfirmationMessage(e.source_document_title)}</p>
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => deleteExtraction(e.extraction_id)}
                            disabled={deleting}
                            className="inline-flex min-h-11 items-center justify-center rounded-md border border-danger-vivid bg-danger-vivid px-4 py-2 text-sm font-semibold text-on-dark transition hover:bg-danger disabled:opacity-50"
                          >
                            {deleting ? 'Deleting…' : 'Delete extraction'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingId(null)}
                            disabled={deleting}
                            className={buttonClasses({ variant: 'secondary' })}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
