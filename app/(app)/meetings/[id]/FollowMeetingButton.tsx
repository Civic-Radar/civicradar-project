'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import styles from '../meetings.module.css';

const LOAD_ERROR = 'Whether you follow this meeting could not be loaded. Please try again.';
const FOLLOW_ERROR = 'This meeting could not be followed. Please try again.';

type Status = 'loading' | 'signedOut' | 'loadFailed' | 'notFollowed' | 'following' | 'followed';

// Follow button for one meeting (SRS-404.1). It shows the saved state on load
// and shows the meeting as followed only after the server confirms the follow.
export default function FollowMeetingButton({ meetingId }: { meetingId: number }) {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [loadError, setLoadError] = useState('');
  const [followError, setFollowError] = useState('');
  const [justFollowed, setJustFollowed] = useState(false);
  // Blocks a second follow before the disabled button has re-rendered.
  const followInFlight = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem('access_token');
    setToken(stored);
    if (!stored) { setStatus('signedOut'); return; }
    loadFollowState(stored);
  }, [meetingId]);

  async function loadFollowState(accessToken: string) {
    setStatus('loading');
    setLoadError('');
    try {
      const res = await fetch(`/api/followed-meetings/${meetingId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      const data = await res.json();
      if (res.status === 401) setStatus('signedOut');
      else if (!res.ok) { setLoadError(data.error || LOAD_ERROR); setStatus('loadFailed'); }
      else setStatus(data.followed ? 'followed' : 'notFollowed');
    } catch {
      setLoadError(LOAD_ERROR);
      setStatus('loadFailed');
    }
  }

  async function handleFollow() {
    if (!token || followInFlight.current) return;
    followInFlight.current = true;
    setStatus('following');
    setFollowError('');
    try {
      const res = await fetch(`/api/followed-meetings/${meetingId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.status === 401) setStatus('signedOut');
      else if (!res.ok) { setFollowError(data.error || FOLLOW_ERROR); setStatus('notFollowed'); }
      else { setJustFollowed(true); setStatus('followed'); }
    } catch {
      setFollowError(FOLLOW_ERROR);
      setStatus('notFollowed');
    }
    followInFlight.current = false;
  }

  if (status === 'signedOut') {
    return (
      <p className={styles.muted}>
        <Link href="/login" className={styles.link}>Log in to follow this meeting.</Link>
      </p>
    );
  }

  if (status === 'loadFailed') {
    return (
      <div>
        <p role="alert" className={styles.error}>{loadError}</p>
        <button type="button" className={styles.button} onClick={() => token && loadFollowState(token)}>
          Try again
        </button>
      </div>
    );
  }

  const followed = status === 'followed';
  const label =
    status === 'loading' ? 'Checking…' : status === 'following' ? 'Following…' : followed ? 'Following' : 'Follow';

  return (
    <div>
      <button
        type="button"
        className={styles.button}
        aria-pressed={followed}
        disabled={status !== 'notFollowed'}
        onClick={handleFollow}
      >
        {label}
      </button>
      {followed && justFollowed ? (
        <p role="status" className={styles.message}>You are following this meeting.</p>
      ) : null}
      {followError ? <p role="alert" className={styles.error}>{followError}</p> : null}
    </div>
  );
}
