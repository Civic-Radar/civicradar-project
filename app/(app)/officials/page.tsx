'use client';

// Officials page — SRS-311.1, AO, View officials list.
// "The system shall display the officials found by the signed-in user's saved
//  extractions who have an email address or telephone number, each listed once
//  with the documents they were found in."
//
// Each official appears once, with name, title, role, email, and phone, each next
// to its field name. A detail no extraction found shows "Not found" (as in
// SRS-308.1). Each entry links to every document it was found in.

import Link from 'next/link';
import { BookUser, ChevronRight, FileText } from 'lucide-react';
import ContactsTabs from '../../components/ContactsTabs';
import LeafLoader from '../../components/art/LeafLoader';
import { useCallback, useEffect, useRef, useState } from 'react';
import DocumentPanel from '../../components/DocumentPanel';
import { alertClasses } from '../../components/ui/Alert';
import { cardClasses } from '../../components/ui/Card';
import SignedOutNotice from '../../components/ui/SignedOutNotice';
import { NOT_FOUND_LABEL, OFFICIAL_FIELDS } from '../../../lib/extractions';
import { groupByTown, type MyOfficial, type OfficialSource } from '../../../lib/officialsList';

// "Found in" opens a small menu of the documents the official was found in, to
// the left of the button (below it on small screens). Picking one opens its card.
function FoundInMenu({ sources, onPick }: { sources: OfficialSource[]; onPick: (source: OfficialSource) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={ref} className="relative w-fit">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 -mx-2 text-xs font-semibold uppercase tracking-[0.1em] text-fg-muted transition-colors hover:bg-raised hover:text-accent"
      >
        Found in
        <span className="font-normal normal-case tracking-normal">
          · {sources.length} {sources.length === 1 ? 'document' : 'documents'}
        </span>
        <ChevronRight aria-hidden="true" className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-20 mt-2 w-72 max-w-[80vw] rounded-md border border-line bg-card shadow-lg sm:left-auto sm:right-full sm:top-1/2 sm:mr-3 sm:mt-0 sm:-translate-y-1/2">
          <p className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-fg-muted">Found in</p>
          <ul aria-label="Documents this official was found in" className="divide-y divide-line">
            {sources.map((source) => (
              <li key={source.extraction_id}>
                <button
                  type="button"
                  onClick={() => { setOpen(false); onPick(source); }}
                  className="group flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-sm text-fg transition-colors hover:bg-raised hover:text-accent"
                >
                  <FileText aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle group-hover:text-accent" />
                  <span className="min-w-0 flex-1 break-words leading-snug">{source.title}</span>
                  <ChevronRight aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export default function OfficialsPage() {
  const [token, setToken] = useState<string | null>(null);
  const [officials, setOfficials] = useState<MyOfficial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // The "Found in" document shown in the side panel, if one is open.
  const [openSource, setOpenSource] = useState<{ source: OfficialSource; townName?: string } | null>(null);
  const closePanel = useCallback(() => setOpenSource(null), []);

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
        <LeafLoader />
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
            The officials your saved extractions found who have an email or phone number, each listed once, with the most recent details and the documents they came from.
          </p>
        </header>

        <ContactsTabs />

        {error ? <p role="alert" className={alertClasses('error')}>{error}</p> : null}

        <section className={cardClasses('sm:p-7')}>
          {!error && officials.length === 0 ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 px-6 py-16 text-center text-fg-muted">
              <BookUser aria-hidden="true" className="h-[30px] w-[30px] text-accent" />
              <p className="max-w-[450px] text-sm leading-relaxed">
                No officials with contact details yet. They appear here when one of your extractions finds someone with an email or phone number. Request one on the{' '}
                <Link href="/extract" className="text-accent hover:underline">Request</Link> tab.
              </p>
            </div>
          ) : null}

          {officials.length > 0 ? (
            <>
              <h2 className="text-lg font-semibold">
                {officials.length} {officials.length === 1 ? 'official' : 'officials'}
              </h2>

              {/* Task 311.1-8: one section per city */}
              <div className="mt-4 space-y-8">
                {groupByTown(officials).map((group) => (
                  <section key={group.town_id ?? 'none'} aria-label={group.town_name}>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.17em] text-accent">
                      {group.town_name} <span className="text-fg-muted">· {group.officials.length}</span>
                    </h3>
                    <ul className="mt-3 space-y-3" aria-label={`Officials in ${group.town_name}`}>
                      {group.officials.map((official) => (
                        <li key={official.key} data-testid="official" className="rounded-md border border-line p-4 sm:p-5">
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

                          {/* The documents this official was found in; each opens its card in a side panel. */}
                          <div className="mt-4 border-t border-line pt-3 text-sm">
                            <FoundInMenu
                              sources={official.sources}
                              onPick={(source) => setOpenSource({ source, townName: official.town_name })}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </>
          ) : null}
        </section>
      </div>

      {openSource ? (
        <DocumentPanel source={openSource.source} townName={openSource.townName} token={token} onClose={closePanel} />
      ) : null}
    </main>
  );
}
