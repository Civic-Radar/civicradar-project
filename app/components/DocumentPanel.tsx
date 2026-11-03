'use client';

// Officials page: the side panel that opens from "Found in" and shows the card
// of the document an official was found in. Reads GET /api/documents/[id].

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { badgeClasses } from './ui/Badge';
import { buttonClasses } from './ui/Button';
import { documentTypeLabel, formatDateTime } from '../../lib/extractions';
import type { OfficialSource } from '../../lib/officialsList';

type DocumentCard = {
  document_id: number;
  title: string;
  document_type: string;
  retrieved_at: string;
  summary_status: string | null;
  summary_text: string | null;
  pdf_url: string | null;
};

const TYPE_TONE: Record<string, 'info' | 'warning' | 'success' | 'neutral'> = {
  Agenda: 'info',
  Packet: 'warning',
  Minutes: 'success',
};

export default function DocumentPanel({
  source,
  townName,
  token,
  onClose,
}: {
  source: OfficialSource;
  townName?: string;
  token: string;
  onClose: () => void;
}) {
  const [document, setDocument] = useState<DocumentCard | null>(null);
  const [error, setError] = useState('');
  const [shown, setShown] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Slide in on open, and close with Escape.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  useEffect(() => {
    if (source.document_id === null) return;
    setDocument(null);
    setError('');
    fetch(`/api/documents/${source.document_id}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) setError(data.error || 'This document could not be loaded.');
        else setDocument(data.document);
      })
      .catch(() => setError('This document could not be loaded.'));
  }, [source.document_id, token]);

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close document"
        tabIndex={-1}
        onClick={onClose}
        className={`absolute inset-0 h-full w-full cursor-default bg-backdrop/45 backdrop-blur-sm transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Document"
        className={`absolute inset-y-0 right-0 flex w-[420px] max-w-[90vw] flex-col overflow-y-auto bg-card p-6 text-fg shadow-2xl transition-transform duration-200 ease-out ${shown ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-start justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-[0.17em] text-accent">Found in</p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close document"
            className="-mr-2 -mt-2 flex h-9 w-9 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-raised"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <h2 className="mt-3 break-words text-lg font-semibold leading-snug">{source.title}</h2>
        {document && document.title !== source.title ? (
          <p className="mt-1 break-words text-xs text-fg-subtle">File: {document.title}</p>
        ) : null}

        {error ? <p role="alert" className="mt-4 text-sm text-danger">{error}</p> : null}
        {!document && !error && source.document_id !== null ? <p className="mt-4 text-sm text-fg-subtle">Loading…</p> : null}
        {source.document_id === null ? <p className="mt-4 text-sm text-fg-muted">This document is no longer available.</p> : null}

        {document ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={badgeClasses(TYPE_TONE[document.document_type] ?? 'neutral')}>{documentTypeLabel(document.document_type)}</span>
              {townName ? <span className={badgeClasses('neutral')}>{townName}</span> : null}
            </div>
            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-muted">Retrieved</dt>
                <dd className="mt-1">{formatDateTime(document.retrieved_at)}</dd>
              </div>
              {document.summary_text ? (
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-muted">Summary</dt>
                  <dd className="mt-1 line-clamp-[8] whitespace-pre-line leading-relaxed text-fg-muted">{document.summary_text}</dd>
                </div>
              ) : null}
            </dl>
          </>
        ) : null}

        <div className="mt-6 flex flex-col gap-2">
          {document?.pdf_url ? (
            <a href={document.pdf_url} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: 'primary', fullWidth: true })}>
              View source PDF <ExternalLink className="ml-1 h-4 w-4" aria-hidden="true" />
            </a>
          ) : null}
          {source.document_id !== null ? (
            <Link href={`/documents/${source.document_id}`} className={buttonClasses({ variant: 'secondary', fullWidth: true })}>
              Open document page
            </Link>
          ) : null}
          <Link href={`/extractions/${source.extraction_id}`} className={buttonClasses({ variant: 'secondary', fullWidth: true })}>
            Open extraction
          </Link>
        </div>
      </div>
    </div>
  );
}
