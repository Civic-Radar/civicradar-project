'use client';

// Extraction page — SRS-301.1 to SRS-301.4 (AO).
//   301.1  user selects a document -> it is marked as selected
//   301.2  the selected document's title is displayed
//   301.3  the request control is disabled while nothing is selected
//   301.4  confirming creates one extraction request linked to the user
// Also shows SRS-301.6 (non-PDF message) and SRS-306.3 (no duplicate in-flight request).
// Each request links to its own page, which shows its status (SRS-306.1).

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { STATUS_STYLES, formatDateTime } from '../../../lib/extractions';
import type { ExtractableDocument, Extraction } from '../../../lib/extractions';

export default function ExtractPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [documents, setDocuments] = useState<ExtractableDocument[]>([]);
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('access_token');
    setToken(stored);
    if (!stored) { setLoading(false); return; }
    loadAll(stored);
  }, []);

  async function loadAll(accessToken: string) {
    setLoading(true);
    const headers = { Authorization: `Bearer ${accessToken}` };
    const [docsRes, extRes] = await Promise.all([
      fetch('/api/extractions/documents', { headers }),
      fetch('/api/extractions', { headers }),
    ]);
    const docsData = await docsRes.json();
    const extData = await extRes.json();
    setLoading(false);

    if (docsRes.status === 401 || extRes.status === 401) {
      localStorage.removeItem('access_token');
      setToken(null);
      return;
    }
    if (!docsRes.ok) { setError(docsData.error || 'Could not load documents.'); return; }
    if (!extRes.ok) { setError(extData.error || 'Could not load your extractions.'); return; }

    setDocuments(docsData.documents);
    setExtractions(extData.extractions);
  }

  async function refreshExtractions() {
    if (!token) return;
    const res = await fetch('/api/extractions', { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setExtractions((await res.json()).extractions);
  }

  const selected = documents.find((d) => d.document_id === selectedId) ?? null;

  // SRS-306.3: the selected document already has a Queued/Processing request.
  const selectedInFlight = selected
    ? extractions.some(
        (e) => e.document_id === selected.document_id && (e.status === 'Queued' || e.status === 'Processing'),
      )
    : false;

  // SRS-301.3: disabled while nothing is selected.
  const requestDisabled = !selected || selectedInFlight || submitting;

  function selectDocument(id: number) {
    setSelectedId(id);
    setConfirming(false);
    setError('');
    setSuccess('');
  }

  async function confirmExtraction() {
    if (!token || !selected) return;
    setSubmitting(true);
    setError('');
    setSuccess('');

    const res = await fetch('/api/extractions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ document_id: selected.document_id }),
    });
    const data = await res.json();

    setSubmitting(false);
    setConfirming(false);

    if (!res.ok) {
      setError(data.error || 'The extraction request could not be created.');
      return;
    }

    setSuccess(`Extraction requested for "${data.extraction.source_document_title}".`);

    // SRS-302.1: start reading the document right away. The run takes a few
    // seconds, so don't wait for it; the list refreshes when it finishes.
    fetch(`/api/extractions/${data.extraction.extraction_id}/run`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(() => refreshExtractions())
      .catch(() => {});

    await refreshExtractions();
  }

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
          <p className="text-fg-muted">You must be logged in to request an extraction.</p>
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
          <h1 className="mt-2 text-3xl font-semibold">Request contact extraction</h1>
          <p className="mt-2 text-fg-subtle">
            Pick a government document and Civic Radar will pull out the officials and their contact information.
          </p>
        </header>

        {error ? (
          <p role="alert" className="rounded-xl border border-danger-line bg-danger-wash/30 p-3 text-sm text-danger">{error}</p>
        ) : null}
        {success ? (
          <p role="status" className="rounded-xl border border-accent-line bg-accent-wash/30 p-3 text-sm text-accent-soft">{success}</p>
        ) : null}

        {/* Step 1 — choose a document (SRS-301.1) */}
        <section className="rounded-3xl border border-raised bg-card/90 p-6">
          <h2 className="text-lg font-medium">1. Choose a document</h2>

          {documents.length === 0 ? (
            <p className="mt-4 text-sm text-fg-subtle">
              No documents have been retrieved yet. (Run <code className="text-fg-muted">supabase/seed_extraction_demo.sql</code> to load demo documents.)
            </p>
          ) : (
            <ul className="mt-4 space-y-2" role="radiogroup" aria-label="Documents">
              {documents.map((doc) => {
                const isSelected = doc.document_id === selectedId;
                const isPdf = doc.mime_type === 'application/pdf';
                return (
                  <li key={doc.document_id}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => selectDocument(doc.document_id)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                        isSelected
                          ? 'border-accent-strong bg-accent-vivid/10'
                          : 'border-raised bg-surface/50 hover:border-line-strong'
                      }`}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="font-medium">{doc.title}</span>
                        {isSelected ? (
                          <span className="shrink-0 rounded-full bg-accent-strong px-2 py-0.5 text-xs font-semibold text-surface">Selected</span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-xs text-fg-subtle">
                        {doc.document_type} · {isPdf ? 'PDF' : 'Not a PDF'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Step 2 — confirm (SRS-301.2, 301.3, 301.4) */}
        <section className="rounded-3xl border border-raised bg-card/90 p-6">
          <h2 className="text-lg font-medium">2. Confirm extraction</h2>

          <p className="mt-3 text-sm text-fg-subtle">Selected document:</p>
          <p className="mt-1 font-medium" data-testid="selected-title">
            {selected ? selected.title : <span className="text-fg-faint">None selected</span>}
          </p>

          {selectedInFlight ? (
            <p className="mt-3 text-sm text-warning-soft">An extraction for this document is already in progress.</p>
          ) : null}

          {confirming && selected ? (
            <div className="mt-5 rounded-2xl border border-line bg-surface/60 p-4">
              <p className="text-sm">Extract officials and contact information from <strong>{selected.title}</strong>?</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={confirmExtraction}
                  disabled={submitting}
                  className="rounded-full bg-accent-strong px-5 py-2 text-sm font-semibold text-surface hover:bg-accent disabled:opacity-50"
                >
                  {submitting ? 'Requesting…' : 'Confirm extraction'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={submitting}
                  className="rounded-full border border-line px-5 py-2 text-sm hover:border-fg-faint"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={requestDisabled}
              className="mt-5 rounded-full bg-accent-strong px-5 py-2 text-sm font-semibold text-surface hover:bg-accent disabled:cursor-not-allowed disabled:bg-line disabled:text-fg-subtle"
            >
              Request extraction
            </button>
          )}
        </section>

        {/* The user's requests — shows the one just created */}
        <section className="rounded-3xl border border-raised bg-card/90 p-6">
          <h2 className="text-lg font-medium">My extraction requests</h2>
          {extractions.length === 0 ? (
            <p className="mt-4 text-sm text-fg-subtle">You haven&apos;t requested any extractions yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-raised">
              {extractions.map((e) => (
                <li key={e.extraction_id}>
                  {/* SRS-306.1: open the request to see its current status */}
                  <Link
                    href={`/extractions/${e.extraction_id}`}
                    className="-mx-3 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-3 hover:bg-raised/60"
                  >
                    <div>
                      <p className="font-medium">{e.source_document_title}</p>
                      <p className="text-xs text-fg-subtle">
                        Request #{e.extraction_id} · Requested {formatDateTime(e.requested_at)}
                      </p>
                    </div>
                    <span className={`rounded-full border px-3 py-1 text-xs ${STATUS_STYLES[e.status] ?? ''}`}>{e.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-sm text-fg-subtle">
          Back to <Link href="/" className="text-accent hover:underline">home</Link>
        </p>
      </div>
    </main>
  );
}
