'use client';

import { useEffect, useState } from 'react';
import styles from './meetings.module.css';

type Town = { town_id: number; name: string; meeting_time_zone: string };

type Meeting = {
  meeting_id: number;
  town_id: number;
  title: string | null;
  source_body_name: string | null;
  source_start_time: string | null;
  start_at: string | null;
  location: string | null;
  online_link: string | null;
  source_url: string | null;
};

// SRS-220.4: a detail the source omits is marked as not provided.
const NOT_PROVIDED = 'Not provided by the source';

// Shows start_at as the town's local time, never the browser's.
function formatStartTime(meeting: Meeting, timeZone: string): string | null {
  if (meeting.start_at) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(meeting.start_at));
  }
  return meeting.source_start_time;
}

function LinkOrNotProvided({ href }: { href: string | null }) {
  if (!href) return <span className={styles.missing}>{NOT_PROVIDED}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={styles.link}>
      {href}
    </a>
  );
}

function TextOrNotProvided({ value }: { value: string | null }) {
  if (!value) return <span className={styles.missing}>{NOT_PROVIDED}</span>;
  return <>{value}</>;
}

export default function MeetingsPage() {
  const [town, setTown] = useState<Town | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState('');
  const [resultIsError, setResultIsError] = useState(false);

  useEffect(() => {
    loadMeetings();
  }, []);

  async function loadMeetings() {
    setLoadingList(true);
    setLoadError('');
    try {
      const response = await fetch('/api/meetings', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) {
        setLoadError(data.error || 'Could not load stored meetings.');
        return;
      }
      const towns: Town[] = data.towns ?? [];
      if (towns.length === 0) {
        setTown(null);
        setLoadError('No supported towns were found.');
        return;
      }
      const firstTown = towns[0];
      setTown(firstTown);
      setMeetings((data.meetings ?? []).filter((m: Meeting) => m.town_id === firstTown.town_id));
    } catch {
      setLoadError('Could not load stored meetings.');
    } finally {
      setLoadingList(false);
    }
  }

  async function handleRun() {
    if (!town) return;
    setRunning(true);
    setResult('');
    setResultIsError(false);
    try {
      const response = await fetch('/api/retrieval/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ townId: town.town_id }),
      });
      const data = await response.json();
      if (response.ok) {
        setResult(`Saved ${data.saved} meetings`);
        await loadMeetings();
      } else {
        setResultIsError(true);
        setResult(data.error || 'Retrieval failed.');
      }
    } catch {
      setResultIsError(true);
      setResult('Retrieval failed.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Retrieval</p>
        <h1 className={styles.heading}>{town ? `Meeting retrieval (${town.name})` : 'Meeting retrieval'}</h1>

        <button type="button" onClick={handleRun} disabled={running || !town} className={styles.button}>
          {running ? 'Running...' : 'Run retrieval'}
        </button>

        {result ? <p className={resultIsError ? styles.error : styles.message}>{result}</p> : null}

        {loadError ? <p className={styles.error}>{loadError}</p> : null}

        {loadingList ? (
          <p className={styles.muted}>Loading stored meetings...</p>
        ) : town && !loadError ? (
          meetings.length === 0 ? (
            <p className={styles.muted}>No meetings are stored for this town yet.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Governing body</th>
                    <th>Start time</th>
                    <th>Location</th>
                    <th>Online participation link</th>
                    <th>Recording link</th>
                    <th>Official source link</th>
                  </tr>
                </thead>
                <tbody>
                  {meetings.map((meeting) => (
                    <tr key={meeting.meeting_id}>
                      <td><TextOrNotProvided value={meeting.title} /></td>
                      <td><TextOrNotProvided value={meeting.source_body_name} /></td>
                      <td><TextOrNotProvided value={formatStartTime(meeting, town.meeting_time_zone)} /></td>
                      <td><TextOrNotProvided value={meeting.location} /></td>
                      <td><LinkOrNotProvided href={meeting.online_link} /></td>
                      {/* Recording links are not stored yet (SRS-220.10). */}
                      <td><span className={styles.missing}>{NOT_PROVIDED}</span></td>
                      <td><LinkOrNotProvided href={meeting.source_url} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </section>
    </main>
  );
}
