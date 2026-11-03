'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ExternalLink,
  FileText,
  Globe,
  Leaf,
  MapPin,
  SlidersHorizontal,
} from 'lucide-react';
import styles from '../meetings.module.css';
import LeafLoader from '../../../components/art/LeafLoader';
import { buttonClasses } from '../../../components/ui/Button';
import { HIGHLIGHT_PARAM, matchRanges, searchTerms } from '../../../../lib/search';
import { useIsAdministrator } from '../../../admin/retrieval/useIsAdministrator';
import FollowMeetingButton from './FollowMeetingButton';
import { useMeetingDetails, type AgendaItem, type MeetingDetails, type MeetingDocument } from './useMeetingDetails';

// SRS-502.3: a detail the source omits is marked as not provided.
const NOT_PROVIDED = 'Not provided by the source';

// SRS-502.9: label for the official source link.
const OPEN_ON_CIVICCLERK = 'Open on CivicClerk';

// SRS-502.5: shown when the meeting has zero linked documents.
const NO_DOCUMENTS = 'No documents have been published for this meeting yet.';

// SRS-502.6: shown when the source provides agenda items but this meeting has none yet.
const NO_AGENDA_ITEMS = 'No agenda items have been posted for this meeting yet.';

// SRS-502.8: shown in place of agenda items or recordings when the town's source does not provide them.
const NOT_AVAILABLE = 'Not available from this source';

const EYEBROW = 'text-xs font-semibold uppercase tracking-[0.17em] text-accent';

// Around FollowMeetingButton: one button width for every label, and the "You are
// following this meeting." note (role status) taken out of the flow under the
// button, so following or unfollowing never moves the header.
const FOLLOW_ACTIONS =
  'relative [&>div>button]:min-w-[8.5rem] [&_[role=status]]:absolute [&_[role=status]]:left-0 [&_[role=status]]:top-full ' +
  '[&_[role=status]]:mt-1.5 [&_[role=status]]:whitespace-nowrap [&_[role=status]]:px-2 [&_[role=status]]:py-1 ' +
  '[&_[role=status]]:text-xs [&_[role=status]]:leading-4';
const CELL_LABEL = 'text-xs font-semibold uppercase tracking-wide text-fg-muted';

// Splits start_at into the long date and the time with its zone, in the town's
// local time, never the browser's. null when there is no parsed start time.
function startParts(meeting: MeetingDetails) {
  if (!meeting.start_at || !meeting.meeting_time_zone) return null;
  const start = new Date(meeting.start_at);
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { timeZone: meeting.meeting_time_zone!, ...options }).format(start);
  return {
    date: format({ weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    time: format({ hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
  };
}

function TextOrNotProvided({ value }: { value: string | null }) {
  if (!value) return <span className={styles.missing}>{NOT_PROVIDED}</span>;
  return <>{value}</>;
}

function LinkOrNotProvided({ href }: { href: string | null }) {
  if (!href) return <span className={styles.missing}>{NOT_PROVIDED}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={styles.link}>
      {href}
    </a>
  );
}

// One cell of the facts container: a small icon, an uppercase label and the value.
function InfoCell({ icon: Icon, label, children }: { icon: typeof CalendarDays; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 gap-3 p-5">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" strokeWidth={1.7} aria-hidden="true" />
      <div className="min-w-0">
        <dt className={CELL_LABEL}>{label}</dt>
        <dd className="mt-2 break-words text-sm font-semibold text-fg">{children}</dd>
      </div>
    </div>
  );
}

// A detail the design has no cell for, kept as a small line under the cells (SRS-502.3, SRS-502.8).
function SmallDetail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2 text-xs">
      <dt className="font-semibold text-fg-muted">{label}</dt>
      <dd className="text-fg-subtle">{children}</dd>
    </div>
  );
}

// One color per document type (schema: Agenda, Minutes, Packet, Other).
const BADGE_CLASS: Record<string, string> = {
  Agenda: styles.badgeAgenda,
  Minutes: styles.badgeMinutes,
  Packet: styles.badgePacket,
};

function DocumentTypeBadge({ type }: { type: string }) {
  return <span className={`${styles.badge} ${BADGE_CLASS[type] ?? styles.badgeOther}`}>{type}</span>;
}

// SRS-502.4: lists every document linked to the meeting, each opening the source copy.
function DocumentList({ documents }: { documents: MeetingDocument[] }) {
  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-line bg-card px-6 py-16 text-center">
        <BookOpen className="h-8 w-8 text-accent" strokeWidth={1.5} aria-hidden="true" />
        <p className="font-semibold text-fg-muted">{NO_DOCUMENTS}</p>
      </div>
    );
  }
  return (
    <ul className={styles.documentList}>
      {documents.map((document) => (
        <li key={document.document_id} className={styles.documentItem}>
          <div className={styles.documentIcon} aria-hidden="true">
            <FileText size={20} strokeWidth={1.5} />
          </div>
          <div className={styles.documentInfo}>
            {document.document_type ? <DocumentTypeBadge type={document.document_type} /> : null}
            {/* The title opens the document's detail page (SRS-203.1); "Open document" opens the source copy. */}
            <p className={styles.documentTitle}>
              <Link href={`/documents/${document.document_id}`} className={styles.documentTitleLink}>
                <TextOrNotProvided value={document.title} />
              </Link>
            </p>
          </div>
          <div className={styles.documentSource}>
            {document.source_url ? (
              <a href={document.source_url} target="_blank" rel="noopener noreferrer" className={styles.link}>
                Open document
              </a>
            ) : (
              <span className={styles.missing}>{NOT_PROVIDED}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// SRS-502.6: the agenda as the meeting's running order, numbered stops down a
// line. Each item's full text shows under its title (when it says more than the
// title), so words found by Search can be highlighted here. When the page was
// opened from Search, the stops of the items that match are filled in green.
// Each item has an id for linking to it.
function AgendaTimeline({ items }: { items: AgendaItem[] }) {
  // The searched words, read after the first render (the address is only in the browser).
  const [terms, setTerms] = useState<string[]>([]);
  useEffect(() => {
    setTerms(searchTerms(new URLSearchParams(window.location.search).get(HIGHLIGHT_PARAM)) ?? []);
  }, []);
  const matches = (item: AgendaItem) =>
    terms.length > 0 && [item.title, item.item_text ?? ''].some((text) => matchRanges(text, terms).length > 0);

  if (items.length === 0) {
    return <p className="rounded-xl border border-line bg-card px-6 py-10 text-center text-sm text-fg-muted">{NO_AGENDA_ITEMS}</p>;
  }
  return (
    <ol className="relative m-0 list-none rounded-xl border border-line bg-card p-5 pl-4 md:p-6">
      {items.map((item, index) => {
        const text = item.item_text?.trim();
        const last = index === items.length - 1;
        const match = matches(item);
        return (
          <li key={item.agenda_item_id} id={`agenda-item-${item.agenda_item_id}`} className={`relative scroll-mt-24 pl-11 ${last ? '' : 'pb-5'}`}>
            {/* The line between stops. */}
            {last ? null : <span aria-hidden="true" className="absolute bottom-0 left-[13px] top-6 w-0.5 rounded bg-line-strong" />}
            <span
              aria-hidden="true"
              className={`absolute left-0.5 top-0 grid h-6 w-6 place-items-center rounded-full border-2 text-[11px] font-semibold tabular-nums ${
                match ? 'border-accent-strong bg-accent-strong text-on-dark' : 'border-line-strong bg-card text-fg-subtle'
              }`}
            >
              {index + 1}
            </span>
            <p className="break-words text-sm font-semibold leading-6 text-fg">{item.title}</p>
            {text && text !== item.title.trim() ? (
              <p className="mt-1 max-w-prose whitespace-pre-line break-words text-sm leading-relaxed text-fg-muted">{text}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// The official agenda for reference: the source copy of the meeting's Agenda
// document, or its page here when the source link is missing.
function OfficialAgendaLink({ documents }: { documents: MeetingDocument[] }) {
  const agenda = documents.find((document) => document.document_type === 'Agenda');
  if (!agenda) return null;
  const className = 'inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent hover:underline';
  return agenda.source_url ? (
    <a href={agenda.source_url} target="_blank" rel="noopener noreferrer" className={className}>
      View the official agenda
      <ExternalLink className="h-4 w-4" aria-hidden="true" />
    </a>
  ) : (
    <Link href={`/documents/${agenda.document_id}`} className={className}>
      View the official agenda
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

// "Why this is on your radar", built only from the town and the user's own follows.
function RadarPanel({ meeting, followedTownIds, followedTopics }: {
  meeting: MeetingDetails;
  followedTownIds: number[] | null;
  followedTopics: string[];
}) {
  const followsTown = meeting.town_name !== null && (followedTownIds ?? []).includes(meeting.town_id);
  return (
    <aside className="rounded-xl border border-line bg-card p-6">
      <p className={EYEBROW}>Why this is on your radar</p>
      <h2 className="mt-3 font-display text-3xl font-normal leading-tight tracking-tight">Connected to your community.</h2>
      {meeting.town_name ? (
        <p className="mt-4">
          <span className="inline-flex items-center gap-1 rounded-md bg-accent-wash px-2 py-1 text-xs font-medium text-accent-strong">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {meeting.town_name}
          </span>
        </p>
      ) : null}
      {followsTown ? (
        <p className="mt-4 text-sm leading-relaxed text-fg-muted">
          {meeting.town_name} is one of the towns you follow. Explore its meeting materials and official source.
        </p>
      ) : null}
      {followedTopics.length > 0 ? (
        <div className="mt-6">
          <p className={EYEBROW}>Your followed topics</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {followedTopics.map((topic) => (
              <li key={topic} className="rounded-md bg-accent-wash px-2 py-1 text-xs font-medium text-accent-strong">{topic}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <Link
        href="/preferences"
        className="mt-6 flex min-h-11 items-center gap-2 border-t border-line pt-4 text-sm font-semibold text-accent hover:underline"
      >
        <Leaf className="h-4 w-4" aria-hidden="true" />
        Manage your interests
        <ArrowRight className="ml-auto h-4 w-4" aria-hidden="true" />
      </Link>
    </aside>
  );
}

export default function MeetingDetailsPage({ params }: { params: { id: string } }) {
  const state = useMeetingDetails(params.id);
  const isAdministrator = useIsAdministrator();

  return (
    <main className={styles.main}>
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/meetings"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-fg-muted hover:text-fg hover:underline"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to meetings
          </Link>
          {/* A link to the retrieval page for administrators only; never a retrieval control. */}
          {isAdministrator === true ? (
            <Link href="/admin/retrieval" className={buttonClasses({ variant: 'secondary' })}>
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              Retrieval tool
            </Link>
          ) : null}
        </div>

        {state.status === 'loading' ? (
          <LeafLoader label="Loading meeting..." />
        ) : state.status === 'notFound' ? (
          <h1 className="font-display text-4xl font-normal leading-tight tracking-tight">Meeting not found</h1>
        ) : state.status === 'loadFailed' ? (
          <p className={styles.error}>{state.error}</p>
        ) : (
          <MeetingOverview
            meeting={state.meeting}
            documents={state.documents}
            agendaItems={state.agendaItems ?? []}
            followedTownIds={state.followedTownIds}
            followedTopics={state.followedTopics}
          />
        )}
      </div>
    </main>
  );
}

function MeetingOverview({ meeting, documents, agendaItems, followedTownIds, followedTopics }: {
  meeting: MeetingDetails;
  documents: MeetingDocument[];
  agendaItems: AgendaItem[];
  followedTownIds: number[] | null;
  followedTopics: string[];
}) {
  const start = startParts(meeting);
  const bodyName = meeting.body_name ?? meeting.source_body_name;
  const locationLines = (meeting.location ?? '').split('\n').map((line) => line.trim()).filter(Boolean);

  return (
    <>
      {/* From md up, two columns: the title column takes the remaining width and the
          actions keep their own width, bottom-aligned, whatever the title's length. */}
      <header className="flex flex-col gap-6 border-b border-line pb-8 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="min-w-0">
          {meeting.town_name ? (
            <span className="inline-flex rounded-md border border-line bg-card px-2.5 py-1 text-sm font-medium text-fg">
              {meeting.town_name}
            </span>
          ) : null}
          <h1 className="mt-4 break-words font-display text-4xl font-normal leading-tight tracking-tight sm:text-5xl">
            <TextOrNotProvided value={meeting.title} />
          </h1>
          <p className="mt-3 text-fg-muted">
            {bodyName ? `${bodyName} · ` : null}
            <TextOrNotProvided value={meeting.town_name} />
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3 md:shrink-0 md:flex-nowrap">
          {/* Follow and Unfollow (SRS-404.1, SRS-404.2) are unchanged. */}
          <div className={`${styles.headerActions} ${FOLLOW_ACTIONS}`}>
            <FollowMeetingButton meetingId={meeting.meeting_id} />
          </div>
          {meeting.source_url ? (
            <a
              href={meeting.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClasses({ variant: 'secondary' })}
            >
              {OPEN_ON_CIVICCLERK}
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
          ) : null}
        </div>
      </header>

      <div className="mt-8 flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          {/* A label/value list so each cell stacks at phone width. */}
          <dl className="overflow-hidden rounded-xl border border-line bg-card">
            <div className="grid divide-y divide-line md:grid-cols-3 md:divide-x md:divide-y-0">
              <InfoCell icon={CalendarDays} label="Date & time">
                {start ? (
                  <>
                    {start.date}
                    <span className="mt-1 block text-xs font-normal text-fg-muted">{start.time}</span>
                  </>
                ) : (
                  <TextOrNotProvided value={meeting.source_start_time} />
                )}
              </InfoCell>
              <InfoCell icon={MapPin} label="Location">
                {locationLines.length > 0 ? (
                  <>
                    {locationLines[0]}
                    {locationLines.slice(1).map((line, index) => (
                      <span key={index} className="mt-1 block text-xs font-normal text-fg-muted">{line}</span>
                    ))}
                  </>
                ) : (
                  <TextOrNotProvided value={null} />
                )}
              </InfoCell>
              <InfoCell icon={Globe} label="Online participation">
                <LinkOrNotProvided href={meeting.online_link} />
              </InfoCell>
            </div>
            {/* Details with no cell in the design (SRS-502.3, SRS-502.8, SRS-502.9). */}
            {!bodyName || !meeting.source_url || !meeting.provides_agenda_items || !meeting.provides_recordings ? (
              <div className="space-y-1 border-t border-line px-5 py-3">
                {!bodyName ? <SmallDetail label="Governing body"><TextOrNotProvided value={null} /></SmallDetail> : null}
                {!meeting.source_url ? (
                  <SmallDetail label="Official source link"><TextOrNotProvided value={null} /></SmallDetail>
                ) : null}
                {/* Agenda items for towns that provide them are listed below (SRS-502.6); recordings are SRS-502.7. */}
                {!meeting.provides_agenda_items ? (
                  <SmallDetail label="Agenda items"><span className={styles.missing}>{NOT_AVAILABLE}</span></SmallDetail>
                ) : null}
                {!meeting.provides_recordings ? (
                  <SmallDetail label="Recordings"><span className={styles.missing}>{NOT_AVAILABLE}</span></SmallDetail>
                ) : null}
              </div>
            ) : null}
          </dl>

          {meeting.provides_agenda_items ? (
            <section aria-labelledby="agenda-heading">
              <div className="mt-10 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className={EYEBROW}>Running order</p>
                  <h2 id="agenda-heading" className="mt-2 font-display text-3xl font-normal leading-tight tracking-tight">Agenda</h2>
                </div>
                <OfficialAgendaLink documents={documents} />
              </div>
              <div className="mt-4">
                <AgendaTimeline items={agendaItems} />
              </div>
            </section>
          ) : null}

          <div className="mt-10 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className={EYEBROW}>Published materials</p>
              <h2 className="mt-2 font-display text-3xl font-normal leading-tight tracking-tight">Meeting documents</h2>
            </div>
            <p className="text-sm text-fg-muted">
              {documents.length} {documents.length === 1 ? 'document' : 'documents'}
            </p>
          </div>
          <div className="mt-4">
            <DocumentList documents={documents} />
          </div>
        </div>

        <div className="lg:w-80 lg:shrink-0">
          <RadarPanel meeting={meeting} followedTownIds={followedTownIds} followedTopics={followedTopics} />
        </div>
      </div>
    </>
  );
}
