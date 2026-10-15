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
};

// SRS-502.3: a detail the source omits is marked as not provided.
const NOT_PROVIDED = 'Not provided by the source';

// SRS-502.9: label for the official source link.
const OPEN_ON_CIVICCLERK = 'Open on CivicClerk';

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

export default function MeetingDetailsPage({ params }: { params: { id: string } }) {
  const [meeting, setMeeting] = useState<MeetingDetails | null>(null);
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

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <tbody>
                  <tr>
                    <th scope="row">Town</th>
                    <td><TextOrNotProvided value={meeting.town_name} /></td>
                  </tr>
                  <tr>
                    <th scope="row">Governing body</th>
                    <td><TextOrNotProvided value={meeting.body_name ?? meeting.source_body_name} /></td>
                  </tr>
                  <tr>
                    <th scope="row">Start time</th>
                    <td><TextOrNotProvided value={formatStartTime(meeting)} /></td>
                  </tr>
                  <tr>
                    <th scope="row">Location</th>
                    <td><TextOrNotProvided value={meeting.location} /></td>
                  </tr>
                  <tr>
                    <th scope="row">Online participation link</th>
                    <td><LinkOrNotProvided href={meeting.online_link} /></td>
                  </tr>
                  <tr>
                    <th scope="row">Official source link</th>
                    <td><LinkOrNotProvided href={meeting.source_url} label={OPEN_ON_CIVICCLERK} /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
