'use client';

// Saved Extractions page — SRS-304.1, AO, Saved extraction list.
// "The system shall list the signed-in user's saved extractions, with each one's
//  source document title and extraction date, when the user opens the Saved
//  Extractions page."
//
// A saved extraction is one that completed and has stored results. Each entry
// opens its results (/extractions/<id>), which are read from the database, so no
// new extraction runs.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { extractionDate, formatDateTime } from '../../../lib/extractions';
import type { Extraction } from '../../../lib/extractions';

export default function SavedExtractionsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      <main className="min-h-screen bg-surface text-fg flex items-center justify-center">
        <p className="text-fg-subtle">Loading…</p>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-surface text-fg flex items-center justify-center px-6">
        <section className="text-center space-y-4">
          <p className="text-fg-muted">You must be logged in to view your saved extractions.</p>
          <Link href="/login" className="inline-block rounded-full border border-line bg-raised px-4 py-2 text-sm hover:border-accent-strong hover:text-accent-soft">
            Go to login
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface text-fg px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header>
          <p className="text-sm uppercase tracking-[0.25em] text-accent">Officials &amp; Contacts</p>
          <h1 className="mt-2 text-3xl font-semibold">Saved extractions</h1>
          <p className="mt-2 text-fg-subtle">Every extraction you've completed, with the officials it found.</p>
        </header>

        {error ? (
          <p role="alert" className="rounded-xl border border-danger-line bg-danger-wash/30 p-3 text-sm text-danger">{error}</p>
        ) : null}

        <section className="rounded-3xl border border-raised bg-card/90 p-6">
          {extractions.length === 0 ? (
            <p className="text-sm text-fg-subtle">
              You don&apos;t have any saved extractions yet. Request one on the{' '}
              <Link href="/extract" className="text-accent hover:underline">Contact Extraction</Link> page.
            </p>
          ) : (
            <ul className="divide-y divide-raised" aria-label="Saved extractions">
              {extractions.map((e) => (
                <li key={e.extraction_id} data-testid="saved-extraction" className="py-3">
                  <Link href={`/extractions/${e.extraction_id}`} className="-mx-3 block rounded-xl px-3 py-1 hover:bg-raised/60">
                    <p className="font-medium">{e.source_document_title}</p>
                    <p className="text-xs text-fg-subtle">Extracted {formatDateTime(extractionDate(e))}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
