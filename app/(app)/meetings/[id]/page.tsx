'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from '../meetings.module.css';
import FollowMeetingButton from './FollowMeetingButton';

type MeetingDetails = {
  meeting_id: number;
  title: string | null;
  source_body_name: string | null;
  source_start_time: string | null;
  start_at: string | null;
  location: string | null;
  online_link: string | null;
  source_url: string | null;
  town_name: string | null;
  meeting_time_zone: string | null;
  body_name: string | null;
  provides_agenda_items: boolean;
  provides_recordings: boolean;
};

type MeetingDocument = {
  document_id: number;
  title: string | null;
  document_type: string | null;
  source_url: string | null;
};

// SRS-502.3: a detail the source omits is marked as not provided.
const NOT_PROVIDED = 'Not provided by the source';

// SRS-502.9: label for the official source link.
const OPEN_ON_CIVICCLERK = 'Open on CivicClerk';

// SRS-502.5: shown when the meeting has zero linked documents.
const NO_DOCUMENTS = 'No documents have been published for this meeting yet.';

// SRS-502.8: shown in place of agenda items or recordings when the town's source does not provide them.
const NOT_AVAILABLE = 'Not available from this source';

// Shows start_at as the town's local time, never the browser's.
function formatStartTime(meeting: MeetingDetails): string | null {
  if (meeting.start_at && meeting.meeting_time_zone) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: meeting.meeting_time_zone,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(meeting.start_at));
  }
  return meeting.source_start_time;
}

function TextOrNotProvided({ value }: { value: string | null }) {
  if (!value) return <span className={styles.missing}>{NOT_PROVIDED}</span>;
  return <>{value}</>;
}

function LinkOrNotProvided({ href, label }: { href: string | null; label?: string }) {
  if (!href) return <span className={styles.missing}>{NOT_PROVIDED}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={styles.link}>
      {label ?? href}
    </a>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.detailRow}>
      <dt className={styles.detailLabel}>{label}</dt>
      <dd className={styles.detailValue}>{children}</dd>
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
    return <p className={styles.muted}>{NO_DOCUMENTS}</p>;
  }
  return (
    <ul className={styles.documentList}>
      {documents.map((document) => (
        <li key={document.document_id} className={styles.documentItem}>
          <div className={styles.documentInfo}>
            {document.document_type ? <DocumentTypeBadge type={document.document_type} /> : null}
            <p className={styles.documentTitle}>
              <TextOrNotProvided value={document.title} />
            </p>
          </div>
          {document.source_url ? (
            <a href={document.source_url} target="_blank" rel="noopener noreferrer" className={styles.link}>
              Open document
            </a>
          ) : (
            <span className={styles.missing}>{NOT_PROVIDED}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function MeetingDetailsPage({ params }: { params: { id: string } }) {
  const [meeting, setMeeting] = useState<MeetingDetails | null>(null);
  const [documents, setDocuments] = useState<MeetingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    async function loadMeeting() {
      try {
        const response = await fetch(`/api/meetings/${encodeURIComponent(params.id)}`, { cache: 'no-store' });
        const data = await response.json();
        if (response.status === 404) {
          setNotFound(true);
          return;
        }
        if (!response.ok) {
          setLoadError(data.error || 'Could not load the meeting.');
          return;
        }
        setMeeting(data.meeting);
        setDocuments(Array.isArray(data.documents) ? data.documents : []);
      } catch {
        setLoadError('Could not load the meeting.');
      } finally {
        setLoading(false);
      }
    }
    loadMeeting();
  }, [params.id]);

  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <Link href="/meetings" className={styles.link}>
          Back to meetings
        </Link>

        <p className={styles.eyebrow} style={{ marginTop: '1.5rem' }}>
          Meeting details
        </p>

        {loading ? (
          <p className={styles.muted}>Loading meeting...</p>
        ) : notFound ? (
          <h1 className={styles.heading}>Meeting not found</h1>
        ) : loadError ? (
          <p className={styles.error}>{loadError}</p>
        ) : meeting ? (
          <>
            <h1 className={styles.heading}>
              <TextOrNotProvided value={meeting.title} />
            </h1>

            <FollowMeetingButton meetingId={meeting.meeting_id} />

            {/* A label/value list instead of a table so each row wraps at phone width. */}
            <dl className={styles.details}>
              <DetailRow label="Town"><TextOrNotProvided value={meeting.town_name} /></DetailRow>
              <DetailRow label="Governing body">
                <TextOrNotProvided value={meeting.body_name ?? meeting.source_body_name} />
              </DetailRow>
              <DetailRow label="Start time"><TextOrNotProvided value={formatStartTime(meeting)} /></DetailRow>
              <DetailRow label="Location"><TextOrNotProvided value={meeting.location} /></DetailRow>
              <DetailRow label="Online participation link"><LinkOrNotProvided href={meeting.online_link} /></DetailRow>
              <DetailRow label="Official source link">
                <LinkOrNotProvided href={meeting.source_url} label={OPEN_ON_CIVICCLERK} />
              </DetailRow>
              {/* SRS-502.8. Listing agenda items and recordings for towns that provide them is SRS-502.6 / 502.7. */}
              {!meeting.provides_agenda_items ? (
                <DetailRow label="Agenda items"><span className={styles.missing}>{NOT_AVAILABLE}</span></DetailRow>
              ) : null}
              {!meeting.provides_recordings ? (
                <DetailRow label="Recordings"><span className={styles.missing}>{NOT_AVAILABLE}</span></DetailRow>
              ) : null}
            </dl>

            <h2 className={styles.subheading}>Documents</h2>
            <DocumentList documents={documents} />
          </>
        ) : null}
      </section>
    </main>
  );
}
