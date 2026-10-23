'use client';

// Officials page — SRS-311.1, AO, View shared officials list.
// "The system shall display a single shared list of officials extracted from
//  documents for the pilot municipality."
//
// Each official appears once (SRS-311.2 merges repeats), with name, title, role,
// email, and phone, each next to its field name. A detail no document gave shows
// "Not found" (as in SRS-308.1). Each entry links to every document it came from.

import Link from 'next/link';
import { useEffect, useState } from 'react';
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
      <main className="min-h-screen bg-surface text-fg flex items-center justify-center">
        <p className="text-fg-subtle">Loading…</p>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-surface text-fg flex items-center justify-center px-6">
        <section className="text-center space-y-4">
          <p className="text-fg-muted">You must be logged in to view the officials list.</p>
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
          <h1 className="mt-2 text-3xl font-semibold">Officials</h1>
          <p className="mt-2 text-fg-subtle">
            Everyone found by contact extractions, listed once, with the most recent details and the documents they came from.
          </p>
        </header>

        {error ? (
          <p role="alert" className="rounded-xl border border-danger-line bg-danger-wash/30 p-3 text-sm text-danger">{error}</p>
        ) : null}

        {!error && officials.length === 0 ? (
          <section className="rounded-3xl border border-raised bg-card/90 p-6">
            <p className="text-sm text-fg-subtle">
              No officials yet. They appear here after an extraction finds them on the{' '}
              <Link href="/extract" className="text-accent hover:underline">Contact Extraction</Link> page.
            </p>
          </section>
        ) : null}

        {officials.length > 0 ? (
          <section className="rounded-3xl border border-raised bg-card/90 p-6">
            <p className="text-sm text-fg-subtle">
              {officials.length} {officials.length === 1 ? 'official' : 'officials'}
            </p>
            <ul className="mt-4 space-y-3" aria-label="Shared officials list">
              {officials.map((official) => (
                <li key={official.official_id} data-testid="shared-official" className="rounded-2xl border border-raised bg-surface/50 p-4">
                  {official.body_name ? (
                    <p className="mb-3 text-xs uppercase tracking-wide text-accent">{official.body_name}</p>
                  ) : null}

                  <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                    {OFFICIAL_FIELDS.map(({ key, label }) => {
                      const value = official[key];
                      const href = value && key === 'email' ? `mailto:${value}` : value && key === 'phone' ? `tel:${value.replace(/[^\d+]/g, '')}` : null;
                      return (
                        <div key={key} className={key === 'role' ? 'sm:col-span-2' : undefined}>
                          <dt className="text-xs uppercase tracking-wide text-fg-subtle">{label}</dt>
                          <dd className={`mt-0.5 break-words ${!value ? 'text-fg-faint italic' : key === 'full_name' ? 'text-base font-medium' : ''}`}>
                            {href ? <a href={href} className="text-accent hover:underline">{value}</a> : value ?? NOT_FOUND_LABEL}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>

                  {/* The documents this official was found in (SRS-303: each opens its detail page). */}
                  <div className="mt-4 border-t border-raised pt-3 text-sm">
                    <p className="text-xs uppercase tracking-wide text-fg-subtle">Found in</p>
                    <ul className="mt-1 space-y-1">
                      {official.sources.map((source) => (
                        <li key={source.document_id}>
                          <Link href={`/documents/${source.document_id}`} className="text-accent hover:underline">{source.title}</Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
