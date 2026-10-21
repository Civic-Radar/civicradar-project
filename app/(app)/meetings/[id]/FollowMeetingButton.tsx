'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import styles from '../meetings.module.css';

const LOAD_ERROR = 'Whether you follow this meeting could not be loaded. Please try again.';
const FOLLOW_ERROR = 'This meeting could not be followed. Please try again.';
const UNFOLLOW_ERROR = 'This meeting could not be unfollowed. Please try again.';

type Status =
  | 'loading'
  | 'signedOut'
  | 'loadFailed'
  | 'notFollowed'
  | 'following'
  | 'followed'
  | 'confirmingUnfollow'
  | 'unfollowing';

// Follow/Unfollow toggle for one meeting (SRS-404.1, SRS-404.2). The label is the
// action a click takes. Unfollow asks for confirmation first, because once alerts
// exist it also stops them. It shows the saved state on load and changes the
// meeting to followed or not followed only after the server confirms.
export default function FollowMeetingButton({ meetingId }: { meetingId: number }) {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [result, setResult] = useState<'followed' | 'unfollowed' | null>(null);
  // Blocks a second request before the disabled button has re-rendered.
  const requestInFlight = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // The unfollow dialog is open exactly while the status is confirmingUnfollow.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (status === 'confirmingUnfollow' && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (status !== 'confirmingUnfollow' && dialog.open) {
      dialog.close();
    }
  }, [status]);

  // Runs whenever the dialog closes. Cancel, Escape, and a backdrop click leave
  // the meeting followed; after Yes the status has already moved on.
  function cancelUnfollow() {
    setStatus((current) => (current === 'confirmingUnfollow' ? 'followed' : current));
  }

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

  // Unfollow only opens the confirmation; nothing is sent until Yes.
  function handleClick() {
    setActionError('');
    setResult(null);
    if (status === 'followed') setStatus('confirmingUnfollow');
    else sendRequest(false);
  }

  // Follow sends PUT, unfollow sends DELETE. A failure returns to the status the
  // request started from and shows the error.
  async function sendRequest(unfollow: boolean) {
    if (!token || requestInFlight.current) return;
    const startedFrom: Status = unfollow ? 'followed' : 'notFollowed';
    const fallbackError = unfollow ? UNFOLLOW_ERROR : FOLLOW_ERROR;

    requestInFlight.current = true;
    setStatus(unfollow ? 'unfollowing' : 'following');
    setActionError('');
    setResult(null);
    try {
      const res = await fetch(`/api/followed-meetings/${meetingId}`, {
        method: unfollow ? 'DELETE' : 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.status === 401) setStatus('signedOut');
      else if (!res.ok) { setActionError(data.error || fallbackError); setStatus(startedFrom); }
      else {
        setResult(unfollow ? 'unfollowed' : 'followed');
        setStatus(unfollow ? 'notFollowed' : 'followed');
      }
    } catch {
      setActionError(fallbackError);
      setStatus(startedFrom);
    }
    requestInFlight.current = false;
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

  const followed = status === 'followed' || status === 'confirmingUnfollow' || status === 'unfollowing';
  const labels: Record<string, string> = {
    loading: 'Checking…',
    notFollowed: 'Follow',
    following: 'Following…',
    followed: 'Unfollow',
    confirmingUnfollow: 'Unfollow',
    unfollowing: 'Unfollowing…',
  };

  return (
    <div>
      <button
        type="button"
        className={styles.button}
        aria-pressed={followed}
        disabled={status !== 'notFollowed' && status !== 'followed'}
        onClick={handleClick}
      >
        {labels[status]}
      </button>
      {result === 'followed' && status === 'followed' ? (
        <p role="status" className={styles.message}>You are following this meeting.</p>
      ) : null}
      {result === 'unfollowed' && status === 'notFollowed' ? (
        <p role="status" className={styles.message}>You unfollowed this meeting.</p>
      ) : null}
      {actionError ? <p role="alert" className={styles.error}>{actionError}</p> : null}

      {/* Escape and a click on the dimmed backdrop close it like Cancel. */}
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby="unfollow-dialog-title"
        onClose={cancelUnfollow}
        onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}
      >
        <div className={styles.dialogBody}>
          {/* Once alerts exist (SRS-404.3 and later), say that unfollowing stops them. */}
          <h2 id="unfollow-dialog-title" className={styles.dialogTitle}>Stop following this meeting?</h2>
          <div className={styles.dialogActions}>
            <button type="button" className={styles.button} onClick={() => sendRequest(true)}>
              Yes, unfollow
            </button>
            <button ref={cancelRef} type="button" className={styles.secondaryButton} onClick={() => dialogRef.current?.close()}>
              Cancel
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
