'use client';

// Extraction page — SRS-306.1, AO, Extraction status display.
// "The system shall display the extraction's current status (Queued, Processing,
//  Completed, or Failed) while the user views an extraction request."
//
// While the extraction is still Queued or Processing, the page re-checks the
// status every few seconds so a change shows up without reloading.
//
// SRS-302.1, AO, Extracted official details: once Completed, each official is
// shown as its own entry with name, title, role, email, and phone, each next
// to its field name. A detail the document didn't give shows "Not found".
//
// SRS-310.2, AO, Ownership check: opening another user's extraction (for
// example by changing the address) shows "Access denied" and nothing else.
//
// SRS-303.2, AO, Source document link: the document title is a link to the
// source document's detail page (SRS-203.1, /documents/<id>).
//
// SRS-307.2, AO, Known failure cause: a failed extraction also says why when the
// file could not be read, was over the size limit, or was missing.

import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { alertClasses } from '../../../components/ui/Alert';
import { buttonClasses } from '../../../components/ui/Button';
import { cardClasses } from '../../../components/ui/Card';
import {
  ACCESS_DENIED_MESSAGE,
  NOT_FOUND_LABEL,
  NO_OFFICIALS_MESSAGE,
  OFFICIAL_FIELDS,
  STATUS_STYLES,
  formatDateTime,
  isInProgress,
  sortByDetailsFound,
  sourceDocumentHref,
} from '../../../../lib/extractions';
import type { ExtractedOfficial, ExtractionDetail } from '../../../../lib/extractions';

const REFRESH_MS = 3000;

export default function ExtractionPage({ params }: { params: { id: string } }) {
  const [token, setToken] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractionDetail | null>(null);
  const [officials, setOfficials] = useState<ExtractedOfficial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // SRS-310.2: the extraction belongs to another user.
  const [denied, setDenied] = useState(false);

  const load = useCallback(
    async (accessToken: string) => {
      const res = await fetch(`/api/extractions/${encodeURIComponent(params.id)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      const data = await res.json();
      setLoading(false);

      if (res.status === 401) {
        localStorage.removeItem('access_token');
        setToken(null);
        return;
      }
      if (res.status === 403) {
        setDenied(true);
        setExtraction(null);
        setOfficials([]);
        return;
      }
      if (!res.ok) {
        setError(data.error || 'Could not load the extraction.');
        return;
      }
      setError('');
      setExtraction(data.extraction);
      setOfficials(sortByDetailsFound(data.officials ?? []));
    },
    [params.id],
  );

  // First load.
  useEffect(() => {
    const stored = localStorage.getItem('access_token');
    setToken(stored);
    if (!stored) { setLoading(false); return; }
    load(stored);
  }, [load]);

  // SRS-302.1: if the extraction is still waiting to run, start it once.
  // (The server only runs a Queued extraction, so a second start is ignored.)
  const runStarted = useRef(false);
  useEffect(() => {
    if (!token || extraction?.status !== 'Queued' || runStarted.current) return;
    runStarted.current = true;
    fetch(`/api/extractions/${encodeURIComponent(params.id)}/run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(() => load(token))
      .catch(() => {});
  }, [token, extraction?.status, params.id, load]);

  // Keep the status current while the extraction is still running.
  useEffect(() => {
    if (!token || !extraction || !isInProgress(extraction.status)) return;
    const timer = setInterval(() => load(token), REFRESH_MS);
    return () => clearInterval(timer);
  }, [token, extraction, load]);

  if (loading) {
    return (
      <main className="min-w-0 flex-1 p-4 text-fg sm:p-8">
        <p className="text-fg-subtle">Loading…</p>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="min-w-0 flex-1 p-4 text-fg sm:p-8">
        <section className="space-y-4">
          <p className="text-fg-muted">You must be logged in to view an extraction.</p>
          <Link href="/login" className={buttonClasses({ variant: 'primary' })}>
            Go to login
          </Link>
        </section>
      </main>
    );
  }

  // SRS-310.2: another user's extraction — nothing about it is shown.
  if (denied) {
    return (
      <main className="min-w-0 flex-1 p-4 text-fg sm:p-8">
        <section className="max-w-md text-center space-y-4" data-testid="access-denied">
          <p className="text-sm uppercase tracking-[0.25em] text-danger">Access denied</p>
          <p className="text-fg-muted">{ACCESS_DENIED_MESSAGE}</p>
          <Link href="/extract" className="inline-block rounded-full border border-line bg-raised px-4 py-2 text-sm hover:border-accent-strong hover:text-accent-soft">
            Back to my extraction requests
          </Link>
        </section>
      </main>
    );
  }

  const sourceHref = extraction ? sourceDocumentHref(extraction) : null;

  return (
    <main className="min-w-0 flex-1 p-4 text-fg sm:p-8">
      <div className="mx-auto w-full max-w-[900px] space-y-6">
        <header>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.17em] text-accent">Officials &amp; Contacts</p>
          <h1 className="font-display text-3xl font-normal leading-tight tracking-tight sm:text-4xl">Extraction request</h1>
        </header>

        {error ? (
          <p role="alert" className={alertClasses('error')}>{error}</p>
        ) : null}

        {extraction ? (
          <section className={cardClasses('sm:p-7')}>
            <p className="mb-4 text-lg font-semibold text-fg">Document</p>
            {/* SRS-303.2: the source link opens the document's detail page */}
            {sourceHref ? (
              <Link href={sourceHref} data-testid="source-document-link" className="inline-block break-words text-base font-medium text-accent hover:underline">
                {extraction.source_document_title}
              </Link>
            ) : (
              <p className="break-words text-base font-medium">{extraction.source_document_title}</p>
            )}

            {/* SRS-306.1: the current status */}
            <div className="mt-5 flex items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-muted">Status</p>
              <span
                data-testid="extraction-status"
                className={`inline-flex w-fit items-center whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium leading-tight ${STATUS_STYLES[extraction.status] ?? ''}`}
              >
                {extraction.status}
              </span>
            </div>

            <dl className="mt-5 grid gap-3 border-t border-line pt-5 text-xs leading-relaxed text-fg-muted sm:grid-cols-3">
              <div>
                <dt className="font-semibold uppercase tracking-[0.1em]">Request</dt>
                <dd className="mt-1 text-sm text-fg">#{extraction.extraction_id}</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-[0.1em]">Requested</dt>
                <dd className="mt-1 text-sm text-fg">{formatDateTime(extraction.requested_at)}</dd>
              </div>
              {extraction.completed_at ? (
                <div>
                  <dt className="font-semibold uppercase tracking-[0.1em]">Finished</dt>
                  <dd className="mt-1 text-sm text-fg">{formatDateTime(extraction.completed_at)}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}

        {/* SRS-302.1: the officials found, one entry each */}
        {extraction?.status === 'Completed' ? (
          <section className={cardClasses('sm:p-7')}>
            <h2 className="text-lg font-semibold">Officials found</h2>
            {officials.length === 0 ? (
              <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 px-6 py-16 text-center text-fg-muted">
                <BookOpen aria-hidden="true" className="h-[30px] w-[30px] text-accent" />
                <p className="max-w-[450px] text-base font-semibold">{NO_OFFICIALS_MESSAGE}</p>
              </div>
            ) : (
              <ul className="mt-4 space-y-3" aria-label="Extracted officials">
                {officials.map((official) => (
                  <li
                    key={official.extracted_official_id}
                    data-testid="official-entry"
                    className="rounded-md border border-line p-4 sm:p-5"
                  >
                    {/* Name and title on top, then role, then the contact details.
                        Every field keeps its label; a missing one shows "Not found". */}
                    <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                      {OFFICIAL_FIELDS.map(({ key, label }) => {
                        const value = official[key];
                        const href = value && key === 'email' ? `mailto:${value}` : value && key === 'phone' ? `tel:${value.replace(/[^\d+]/g, '')}` : null;
                        return (
                          <div key={key} className={key === 'role' ? 'sm:col-span-2' : undefined}>
                            <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-muted">{label}</dt>
                            <dd
                              className={`mt-1 break-words leading-relaxed ${
                                !value ? 'text-fg-subtle italic' : key === 'full_name' ? 'text-base font-medium' : ''
                              }`}
                            >
                              {href ? (
                                <a href={href} className="text-accent hover:underline">{value}</a>
                              ) : (
                                value ?? NOT_FOUND_LABEL
                              )}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {extraction?.status === 'Failed' ? (
          <div role="alert" className={alertClasses('error')}>
            <p>Extraction was not completed.</p>
            {/* SRS-307.2: the cause, when it is a known one */}
            {extraction.failure_message ? (
              <p data-testid="failure-cause" className="mt-1">{extraction.failure_message}</p>
            ) : null}
          </div>
        ) : null}

        <p className="text-sm text-fg-muted">
          Back to <Link href="/extract" className="text-accent hover:underline">my extraction requests</Link>
        </p>
      </div>
    </main>
  );
}
