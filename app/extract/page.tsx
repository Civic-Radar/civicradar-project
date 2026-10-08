'use client';

// Extraction page — SRS-301.1 to SRS-301.4 (AO).
//   301.1  user selects a document -> it is marked as selected
//   301.2  the selected document's title is displayed
//   301.3  the request control is disabled while nothing is selected
//   301.4  confirming creates one extraction request linked to the user
// Also shows SRS-301.6 (non-PDF message) and SRS-306.3 (no duplicate in-flight request).

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ExtractableDocument, Extraction } from '../../lib/extractions';

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} ${time}`;
}

const STATUS_STYLES: Record<string, string> = {
  Queued: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  Processing: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
  Completed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  Failed: 'border-red-500/40 bg-red-500/10 text-red-200',
};

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
    await refreshExtractions();
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
        <section className="text-center space-y-4">
          <p className="text-slate-300">You must be logged in to request an extraction.</p>
          <Link href="/login" className="inline-block rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm hover:border-emerald-400 hover:text-emerald-200">
            Go to login
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header>
          <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">Officials &amp; Contacts</p>
          <h1 className="mt-2 text-3xl font-semibold">Request contact extraction</h1>
          <p className="mt-2 text-slate-400">
            Pick a government document and Civic Radar will pull out the officials and their contact information.
          </p>
        </header>

        {error ? (
          <p role="alert" className="rounded-xl border border-red-800 bg-red-900/30 p-3 text-sm text-red-300">{error}</p>
        ) : null}
        {success ? (
          <p role="status" className="rounded-xl border border-emerald-800 bg-emerald-900/30 p-3 text-sm text-emerald-200">{success}</p>
        ) : null}

        {/* Step 1 — choose a document (SRS-301.1) */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
          <h2 className="text-lg font-medium">1. Choose a document</h2>

          {documents.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">
              No documents have been retrieved yet. (Run <code className="text-slate-300">supabase/seed_extraction_demo.sql</code> to load demo documents.)
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
                          ? 'border-emerald-400 bg-emerald-500/10'
                          : 'border-slate-800 bg-slate-950/50 hover:border-slate-600'
                      }`}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="font-medium">{doc.title}</span>
                        {isSelected ? (
                          <span className="shrink-0 rounded-full bg-emerald-400 px-2 py-0.5 text-xs font-semibold text-slate-950">Selected</span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-xs text-slate-400">
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
        <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
          <h2 className="text-lg font-medium">2. Confirm extraction</h2>

          <p className="mt-3 text-sm text-slate-400">Selected document:</p>
          <p className="mt-1 font-medium" data-testid="selected-title">
            {selected ? selected.title : <span className="text-slate-500">None selected</span>}
          </p>

          {selectedInFlight ? (
            <p className="mt-3 text-sm text-amber-200">An extraction for this document is already in progress.</p>
          ) : null}

          {confirming && selected ? (
            <div className="mt-5 rounded-2xl border border-slate-700 bg-slate-950/60 p-4">
              <p className="text-sm">Extract officials and contact information from <strong>{selected.title}</strong>?</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={confirmExtraction}
                  disabled={submitting}
                  className="rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
                >
                  {submitting ? 'Requesting…' : 'Confirm extraction'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={submitting}
                  className="rounded-full border border-slate-700 px-5 py-2 text-sm hover:border-slate-500"
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
              className="mt-5 rounded-full bg-emerald-400 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
            >
              Request extraction
            </button>
          )}
        </section>

        {/* The user's requests — shows the one just created */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
          <h2 className="text-lg font-medium">My extraction requests</h2>
          {extractions.length === 0 ? (
            <p className="mt-4 text-sm text-slate-400">You haven&apos;t requested any extractions yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-800">
              {extractions.map((e) => (
                <li key={e.extraction_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium">{e.source_document_title}</p>
                    <p className="text-xs text-slate-400">
                      Request #{e.extraction_id} · Requested {formatDateTime(e.requested_at)}
                    </p>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs ${STATUS_STYLES[e.status] ?? ''}`}>{e.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-sm text-slate-400">
          Back to <Link href="/" className="text-emerald-300 hover:underline">home</Link>
        </p>
      </div>
    </main>
  );
}
