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

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  NOT_FOUND_LABEL,
  NO_OFFICIALS_MESSAGE,
  OFFICIAL_FIELDS,
  STATUS_STYLES,
  formatDateTime,
  isInProgress,
} from '../../../../lib/extractions';
import type { ExtractedOfficial, ExtractionDetail } from '../../../../lib/extractions';

const REFRESH_MS = 3000;

export default function ExtractionPage({ params }: { params: { id: string } }) {
  const [token, setToken] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ExtractionDetail | null>(null);
  const [officials, setOfficials] = useState<ExtractedOfficial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      if (!res.ok) {
        setError(data.error || 'Could not load the extraction.');
        return;
      }
      setError('');
      setExtraction(data.extraction);
      setOfficials(data.officials ?? []);
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
      <main className="min-h-screen bg-surface text-fg flex items-center justify-center">
        <p className="text-fg-subtle">Loading…</p>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-surface text-fg flex items-center justify-center px-6">
        <section className="text-center space-y-4">
          <p className="text-fg-muted">You must be logged in to view an extraction.</p>
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
          <h1 className="mt-2 text-3xl font-semibold">Extraction request</h1>
        </header>

        {error ? (
          <p role="alert" className="rounded-xl border border-danger-line bg-danger-wash/30 p-3 text-sm text-danger">{error}</p>
        ) : null}

        {extraction ? (
          <section className="rounded-3xl border border-raised bg-card/90 p-6">
            <p className="text-sm text-fg-subtle">Document</p>
            <p className="mt-1 text-lg font-medium">{extraction.source_document_title}</p>

            {/* SRS-306.1: the current status */}
            <div className="mt-6 flex items-center gap-3">
              <p className="text-sm text-fg-subtle">Status</p>
              <span
                data-testid="extraction-status"
                className={`rounded-full border px-3 py-1 text-sm font-medium ${STATUS_STYLES[extraction.status] ?? ''}`}
              >
                {extraction.status}
              </span>
            </div>

            <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-fg-subtle">Request</dt>
                <dd>#{extraction.extraction_id}</dd>
              </div>
              <div>
                <dt className="text-fg-subtle">Requested</dt>
                <dd>{formatDateTime(extraction.requested_at)}</dd>
              </div>
              {extraction.completed_at ? (
                <div>
                  <dt className="text-fg-subtle">Finished</dt>
                  <dd>{formatDateTime(extraction.completed_at)}</dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}

        {/* SRS-302.1: the officials found, one entry each */}
        {extraction?.status === 'Completed' ? (
          <section className="rounded-3xl border border-raised bg-card/90 p-6">
            <h2 className="text-lg font-medium">Officials found</h2>
            {officials.length === 0 ? (
              <p className="mt-4 text-sm text-fg-subtle">{NO_OFFICIALS_MESSAGE}</p>
            ) : (
              <ul className="mt-4 space-y-3" aria-label="Extracted officials">
                {officials.map((official) => (
                  <li
                    key={official.extracted_official_id}
                    data-testid="official-entry"
                    className="rounded-2xl border border-raised bg-surface/50 p-4"
                  >
                    <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
                      {OFFICIAL_FIELDS.map(({ key, label }) => {
                        const value = official[key];
                        return (
                          <div key={key} className="contents">
                            <dt className="text-fg-subtle">{label}</dt>
                            <dd className={value ? 'break-words' : 'text-fg-faint italic'}>
                              {value ?? NOT_FOUND_LABEL}
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
          <p role="alert" className="rounded-xl border border-danger-line bg-danger-wash/30 p-3 text-sm text-danger">
            Extraction was not completed.
          </p>
        ) : null}

        <p className="text-sm text-fg-subtle">
          Back to <Link href="/extract" className="text-accent hover:underline">my extraction requests</Link>
        </p>
      </div>
    </main>
  );
}
