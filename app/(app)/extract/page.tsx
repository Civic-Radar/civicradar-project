'use client';

// Extraction page — SRS-301.1 to SRS-301.4 (AO).
//   301.1  user selects a document -> it is marked as selected
//   301.2  the selected document's title is displayed
//   301.3  the request control is disabled while nothing is selected
//   301.4  confirming creates one extraction request linked to the user
// Also shows SRS-301.6 (non-PDF message) and SRS-306.3 (no duplicate in-flight request).
// Each request links to its own page, which shows its status (SRS-306.1).
//
// Documents are grouped by meeting, newest meeting first, with a search box.
// Only the most recent meetings are shown until the user asks for more.

import { BookOpen, Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { alertClasses } from '../../components/ui/Alert';
import { badgeClasses } from '../../components/ui/Badge';
import { buttonClasses } from '../../components/ui/Button';
import { cardClasses } from '../../components/ui/Card';
import { STATUS_STYLES, formatDateTime, formatMeetingDate } from '../../../lib/extractions';
import type { ExtractableDocument, Extraction } from '../../../lib/extractions';

const MEETINGS_PER_PAGE = 8;

type MeetingGroup = { key: string; title: string; startAt: string | null; documents: ExtractableDocument[] };

// Groups the (already sorted) documents by meeting, keeping their order.
function groupByMeeting(documents: ExtractableDocument[]): MeetingGroup[] {
  const groups = new Map<string, MeetingGroup>();
  for (const doc of documents) {
    const key = doc.meeting ? String(doc.meeting.meeting_id) : 'none';
    let group = groups.get(key);
    if (!group) {
      group = { key, title: doc.meeting?.title.trim() || 'Other documents', startAt: doc.meeting?.start_at ?? null, documents: [] };
      groups.set(key, group);
    }
    group.documents.push(doc);
  }
  return [...groups.values()];
}

export default function ExtractPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [documents, setDocuments] = useState<ExtractableDocument[]>([]);
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [meetingsShown, setMeetingsShown] = useState(MEETINGS_PER_PAGE);

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

  // Search matches the document title or its meeting's title, ignoring case.
  // While searching, every matching meeting is shown.
  const search = query.trim().toLowerCase();
  const matching = search
    ? documents.filter(
        (d) => d.title.toLowerCase().includes(search) || (d.meeting?.title.toLowerCase().includes(search) ?? false),
      )
    : documents;
  const groups = groupByMeeting(matching);
  const shownGroups = search ? groups : groups.slice(0, meetingsShown);
  const hiddenMeetings = groups.length - shownGroups.length;

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
      <main className="min-w-0 flex-1 p-4 text-fg sm:p-8">
        <p className="text-fg-subtle">Loading…</p>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="min-w-0 flex-1 p-4 text-fg sm:p-8">
        <section className="space-y-4">
          <p className="text-fg-muted">You must be logged in to request an extraction.</p>
          <Link href="/login" className={buttonClasses({ variant: 'primary' })}>
            Go to login
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-w-0 flex-1 p-4 text-fg sm:p-8">
      <div className="mx-auto w-full max-w-[900px] space-y-6">
        <header>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.17em] text-accent">Officials &amp; Contacts</p>
          <h1 className="font-display text-3xl font-normal leading-tight tracking-tight sm:text-4xl">Request contact extraction</h1>
          <p className="mt-3 text-sm leading-relaxed text-fg-muted">
            Pick a government document and Civic Radar will pull out the officials and their contact information.
          </p>
        </header>

        {error ? (
          <p role="alert" className={alertClasses('error')}>{error}</p>
        ) : null}
        {success ? (
          <p role="status" className={alertClasses('success')}>{success}</p>
        ) : null}

        {/* Step 1 — choose a document (SRS-301.1) */}
        <section className={cardClasses('sm:p-7')}>
          <h2 className="text-lg font-semibold">1. Choose a document</h2>

          {documents.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 px-6 py-16 text-center text-fg-muted">
              <BookOpen aria-hidden="true" className="h-[30px] w-[30px] text-accent" />
              <p className="max-w-[450px] text-sm leading-relaxed">
                No documents have been retrieved yet. (Run <code className="break-all text-fg">supabase/seed_extraction_salem_documents.sql</code> to load Salem documents.)
              </p>
            </div>
          ) : (
            <>
              <label htmlFor="document-search" className="sr-only">Search documents</label>
              <div className="mt-4 flex items-center gap-2 rounded-md border border-line bg-card pl-4 transition focus-within:border-accent focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
                <Search aria-hidden="true" className="h-[17px] w-[17px] shrink-0 text-fg-subtle" />
                <input
                  id="document-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by meeting or document title"
                  className="min-h-12 w-full min-w-0 border-0 bg-transparent py-3 pr-3 text-sm text-fg outline-none placeholder:text-fg-subtle"
                />
              </div>
              <p className="mt-4 text-xs leading-relaxed text-fg-muted">
                {matching.length} {matching.length === 1 ? 'document' : 'documents'} from {groups.length}{' '}
                {groups.length === 1 ? 'meeting' : 'meetings'}, newest first
              </p>

              {matching.length === 0 ? (
                <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 px-6 py-16 text-center text-fg-muted">
                  <BookOpen aria-hidden="true" className="h-[30px] w-[30px] text-accent" />
                  <p className="max-w-[450px] text-sm font-semibold leading-relaxed">No documents match &ldquo;{query.trim()}&rdquo;.</p>
                </div>
              ) : (
                <div className="mt-4 space-y-6" role="radiogroup" aria-label="Documents">
                  {shownGroups.map((group) => (
                    <section key={group.key} aria-label={group.title}>
                      <h3 className="text-sm font-semibold text-fg">
                        {group.title}
                        {group.startAt ? <span className="font-normal text-fg-muted"> · {formatMeetingDate(group.startAt)}</span> : null}
                      </h3>
                      <ul className="mt-3 space-y-3">
                        {group.documents.map((doc) => {
                          const isSelected = doc.document_id === selectedId;
                          const isPdf = doc.mime_type === 'application/pdf';
                          return (
                            <li key={doc.document_id}>
                              <button
                                type="button"
                                role="radio"
                                aria-checked={isSelected}
                                onClick={() => selectDocument(doc.document_id)}
                                className={`flex w-full items-start gap-3 rounded-md border p-4 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                                  isSelected
                                    ? 'border-accent bg-accent-wash'
                                    : 'border-line bg-card hover:border-line-strong hover:bg-raised'
                                }`}
                              >
                                <span aria-hidden="true" className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border border-line-strong bg-card">
                                  <span className={`h-2 w-2 rounded-full ${isSelected ? 'bg-accent' : 'bg-transparent'}`} />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-start justify-between gap-3">
                                    <span className="break-words text-sm font-medium">{doc.title}</span>
                                    {isSelected ? (
                                      <span className={badgeClasses('success', 'shrink-0')}>Selected</span>
                                    ) : null}
                                  </span>
                                  <span className="mt-2 block text-xs leading-relaxed text-fg-muted">
                                    {doc.document_type} · {isPdf ? 'PDF' : 'Not a PDF'}
                                  </span>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </div>
              )}

              {hiddenMeetings > 0 ? (
                <button
                  type="button"
                  onClick={() => setMeetingsShown((n) => n + MEETINGS_PER_PAGE)}
                  className={buttonClasses({ variant: 'secondary', className: 'mt-5' })}
                >
                  Show older meetings ({hiddenMeetings} more)
                </button>
              ) : null}
            </>
          )}
        </section>

        {/* Step 2 — confirm (SRS-301.2, 301.3, 301.4) */}
        <section className={cardClasses('sm:p-7')}>
          <h2 className="text-lg font-semibold">2. Confirm extraction</h2>

          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.1em] text-fg-muted">Selected document:</p>
          <p className="mt-3 break-words text-sm font-medium" data-testid="selected-title">
            {selected ? selected.title : <span className="font-normal text-fg-subtle">None selected</span>}
          </p>

          {selectedInFlight ? (
            <p className="mt-3 text-sm text-warning">An extraction for this document is already in progress.</p>
          ) : null}

          {confirming && selected ? (
            <div className="mt-5 rounded-md border border-line bg-raised p-5">
              <p className="break-words text-sm leading-relaxed text-fg-muted">Extract officials and contact information from <strong className="font-semibold text-fg">{selected.title}</strong>?</p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={confirmExtraction}
                  disabled={submitting}
                  className={buttonClasses()}
                >
                  {submitting ? 'Requesting…' : 'Confirm extraction'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={submitting}
                  className={buttonClasses({ variant: 'secondary', className: 'disabled:hover:border-line disabled:hover:bg-card' })}
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
              className={buttonClasses({ fullWidth: true, className: 'mt-5' })}
            >
              Request extraction
            </button>
          )}
        </section>

        {/* The user's requests — shows the one just created */}
        <section className={cardClasses('sm:p-7')}>
          <h2 className="text-lg font-semibold">My extraction requests</h2>
          {extractions.length === 0 ? (
            <p className="mt-4 text-xs leading-relaxed text-fg-muted">You haven&apos;t requested any extractions yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {extractions.map((e) => (
                <li key={e.extraction_id}>
                  {/* SRS-306.1: open the request to see its current status */}
                  <Link
                    href={`/extractions/${e.extraction_id}`}
                    className="-mx-3 flex flex-wrap items-center justify-between gap-3 rounded-md px-3 py-4 transition hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-medium">{e.source_document_title}</p>
                      <p className="mt-2 text-xs leading-relaxed text-fg-muted">
                        Request #{e.extraction_id} · Requested {formatDateTime(e.requested_at)}
                      </p>
                    </div>
                    <span className={`inline-flex w-fit items-center whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium leading-tight ${STATUS_STYLES[e.status] ?? ''}`}>{e.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-sm text-fg-muted">
          Back to <Link href="/" className="text-accent hover:underline">home</Link>
        </p>
      </div>
    </main>
  );
}
