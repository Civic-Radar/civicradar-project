'use client';

import Link from 'next/link';
import { useState } from 'react';
import SignedOutNotice from '../../components/ui/SignedOutNotice';
import styles from './meetings.module.css';
import { meetingsForUser } from './meetingsForUser';
import { useMeetingsList, type Meeting } from './useMeetingsList';

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

// Meetings page (SRS-220.3): the stored meetings of the towns the signed-in user follows.
export default function MeetingsPage() {
  const state = useMeetingsList();
  // Empty means All my towns.
  const [selectedTownId, setSelectedTownId] = useState('');

  const towns = state.status === 'loaded' ? state.towns : [];
  const followedTownIds = state.status === 'loaded' ? state.followedTownIds : [];
  const meetings =
    state.status === 'loaded'
      ? meetingsForUser(state.meetings, followedTownIds, selectedTownId ? Number(selectedTownId) : null)
      : [];
  const townsById = new Map(towns.map((town) => [town.town_id, town]));
  const followedTowns = towns
    .filter((town) => followedTownIds.includes(town.town_id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className={styles.main}>
      <section className={styles.card}>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.17em] text-accent">Civic Radar</p>
        <h1 className={styles.heading}>Meetings</h1>

        <div className={styles.panel}>
          {state.status === 'loading' ? (
            <p className={styles.muted}>Loading stored meetings...</p>
          ) : state.status === 'signedOut' ? (
            <SignedOutNotice className="p-6" message="You must be logged in to view your meetings." />
          ) : state.status === 'loadFailed' ? (
            <p className={styles.error}>Could not load stored meetings.</p>
          ) : followedTownIds.length === 0 ? (
            <div className="space-y-2 p-6">
              <p className="text-fg-muted">Choose your towns in Preferences.</p>
              <Link href="/preferences" className="text-accent hover:underline">Go to Preferences</Link>
            </div>
          ) : (
            <>
              <div className={styles.toolbar}>
                <label className="flex flex-col gap-1 text-sm text-fg-muted">
                  Town
                  <select
                    value={selectedTownId}
                    onChange={(event) => setSelectedTownId(event.target.value)}
                    className="min-h-11 rounded-md border border-line bg-surface px-3 text-fg"
                  >
                    <option value="">All my towns</option>
                    {followedTowns.map((town) => (
                      <option key={town.town_id} value={String(town.town_id)}>{town.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              {meetings.length === 0 ? (
                <p className={styles.empty}>No meetings are stored for your towns yet.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Town</th>
                        <th>Governing body</th>
                        <th>Start time</th>
                        <th>Location</th>
                        <th>Online participation link</th>
                        <th>Recording link</th>
                        <th>Official source link</th>
                      </tr>
                    </thead>
                    <tbody>
                      {meetings.map((meeting) => {
                        const town = townsById.get(meeting.town_id);
                        return (
                          <tr key={meeting.meeting_id}>
                            <td>
                              <Link href={`/meetings/${meeting.meeting_id}`} className={styles.tableLink}>
                                <TextOrNotProvided value={meeting.title} />
                              </Link>
                            </td>
                            <td><TextOrNotProvided value={town?.name ?? null} /></td>
                            <td><TextOrNotProvided value={meeting.source_body_name} /></td>
                            <td><TextOrNotProvided value={town ? formatStartTime(meeting, town.meeting_time_zone) : meeting.source_start_time} /></td>
                            <td><TextOrNotProvided value={meeting.location} /></td>
                            <td><LinkOrNotProvided href={meeting.online_link} /></td>
                            {/* Recording links are not stored yet (SRS-220.10). */}
                            <td><span className={styles.missing}>{NOT_PROVIDED}</span></td>
                            <td><LinkOrNotProvided href={meeting.source_url} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
