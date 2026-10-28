'use client';

// Officials page — SRS-311.1, AO, View shared officials list.
// "The system shall display a single shared list of officials extracted from
//  documents for the pilot municipality."
//
// Each official appears once (SRS-311.2 merges repeats), with name, title, role,
// email, and phone, each next to its field name. A detail no document gave shows
// "Not found" (as in SRS-308.1). Each entry links to every document it came from.

import Link from 'next/link';
import { BookUser } from 'lucide-react';
import ContactsTabs from '../../components/ContactsTabs';
import { useEffect, useState } from 'react';
import { alertClasses } from '../../components/ui/Alert';
import { cardClasses } from '../../components/ui/Card';
import SignedOutNotice from '../../components/ui/SignedOutNotice';
import { NOT_FOUND_LABEL, OFFICIAL_FIELDS } from '../../../lib/extractions';
import type { SharedOfficial } from '../../../lib/extractions';

export default function OfficialsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [officials, setOfficials] = useState<SharedOfficial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('access_token');
    setToken(stored);
    if (!stored) { setLoading(false); return; }

    fetch('/api/officials', { headers: { Authorization: `Bearer ${stored}` }, cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (res.status === 401) {
          localStorage.removeItem('access_token');
          setToken(null);
        } else if (!res.ok) {
          setError(data.error || 'Could not load the officials.');
        } else {
          setOfficials(data.officials);
        }
      })
      .catch(() => setError('Could not load the officials.'))
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
        <SignedOutNotice message="You must be logged in to view the officials list." />
      </main>
    );
  }

  return (
    <main className="min-w-0 flex-1 p-4 text-fg sm:p-8">
      <div className="mx-auto w-full max-w-[900px] space-y-6">
        <header>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.17em] text-accent">Officials &amp; Contacts</p>
          <h1 className="font-display text-3xl font-normal leading-tight tracking-tight sm:text-4xl">Officials</h1>
          <p className="mt-3 text-sm leading-relaxed text-fg-muted">
            Everyone found by contact extractions, listed once, with the most recent details and the documents they came from.
          </p>
        </header>

        <ContactsTabs />

        {error ? <p role="alert" className={alertClasses('error')}>{error}</p> : null}

        <section className={cardClasses('sm:p-7')}>
          {!error && officials.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 px-6 py-16 text-center text-fg-muted">
              <BookUser aria-hidden="true" className="h-[30px] w-[30px] text-accent" />
              <p className="max-w-[450px] text-sm leading-relaxed">
                No officials yet. They appear here after an extraction finds them on the{' '}
                <Link href="/extract" className="text-accent hover:underline">Request</Link> tab.
              </p>
            </div>
          ) : null}

          {officials.length > 0 ? (
            <>
              <h2 className="text-lg font-semibold">
                {officials.length} {officials.length === 1 ? 'official' : 'officials'}
              </h2>
              <ul className="mt-4 space-y-3" aria-label="Shared officials list">
                {officials.map((official) => (
                  <li key={official.official_id} data-testid="shared-official" className="rounded-md border border-line p-4 sm:p-5">
                    {official.body_name ? (
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-accent">{official.body_name}</p>
                    ) : null}

                    <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                      {OFFICIAL_FIELDS.map(({ key, label }) => {
                        const value = official[key];
                        const href = value && key === 'email' ? `mailto:${value}` : value && key === 'phone' ? `tel:${value.replace(/[^\d+]/g, '')}` : null;
                        return (
                          <div key={key} className={key === 'role' ? 'sm:col-span-2' : undefined}>
                            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-muted">{label}</dt>
                            <dd className={`mt-1 break-words leading-relaxed ${!value ? 'text-fg-subtle italic' : key === 'full_name' ? 'text-base font-medium' : ''}`}>
                              {href ? <a href={href} className="text-accent hover:underline">{value}</a> : value ?? NOT_FOUND_LABEL}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>

                    {/* The documents this official was found in; each opens its detail page. */}
                    <div className="mt-4 border-t border-line pt-3 text-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-muted">Found in</p>
                      <ul className="mt-1 space-y-1">
                        {official.sources.map((source) => (
                          <li key={source.document_id}>
                            <Link href={`/documents/${source.document_id}`} className="break-words text-accent hover:underline">{source.title}</Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}
