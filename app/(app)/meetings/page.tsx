'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, CalendarDays, FileText, MapPin, SlidersHorizontal } from 'lucide-react';
import SignedOutNotice from '../../components/ui/SignedOutNotice';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import { buttonClasses } from '../../components/ui/Button';
import styles from './meetings.module.css';
import EmptyArt from '../../components/art/EmptyArt';
import LeafLoader from '../../components/art/LeafLoader';
import { useIsAdministrator } from '../../admin/retrieval/useIsAdministrator';
import { meetingsForUser } from './meetingsForUser';
import { useMeetingsList, type Meeting } from './useMeetingsList';

// SRS-220.4: a detail the source omits is marked as not provided.
const NOT_PROVIDED = 'Not provided by the source';

const ALL_MY_TOWNS = 'All my towns';

// Splits start_at into the date tile and the Date & time column, in the town's
// local time, never the browser's. null when there is no parsed start time.
function startParts(meeting: Meeting, timeZone: string | undefined) {
  if (!meeting.start_at || !timeZone) return null;
  const start = new Date(meeting.start_at);
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { timeZone, ...options }).format(start);
  return {
    month: format({ month: 'short' }),
    day: format({ day: 'numeric' }),
    date: format({ month: 'short', day: 'numeric', year: 'numeric' }),
    time: format({ hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
  };
}

function TextOrNotProvided({ value }: { value: string | null }) {
  if (!value) return <span className={styles.missing}>{NOT_PROVIDED}</span>;
  return <>{value}</>;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

// One meeting row; the whole row opens the meeting's details page.
function MeetingRow({ meeting, townName, timeZone }: { meeting: Meeting; townName: string | null; timeZone: string | undefined }) {
  const start = startParts(meeting, timeZone);
  const documentCount = meeting.document_count;

  return (
    <li>
      <Link
        href={`/meetings/${meeting.meeting_id}`}
        className="flex items-start gap-4 p-4 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:items-center md:gap-6 md:px-6 md:py-5"
      >
        <div
          className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-md bg-accent-wash text-accent-strong"
          aria-hidden="true"
        >
          {start ? (
            <>
              <span className="text-xs font-medium uppercase tracking-wide">{start.month}</span>
              <span className="font-display text-2xl leading-none">{start.day}</span>
            </>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row md:items-center md:gap-6">
          <div className="min-w-0 md:flex-1">
            <p className="break-words font-semibold text-fg">
              <TextOrNotProvided value={meeting.title} />
            </p>
            <p className="mt-1 break-words text-sm text-fg-muted">
              {meeting.source_body_name ? `${meeting.source_body_name} · ` : null}
              <TextOrNotProvided value={townName} />
            </p>
          </div>

          <div className="text-sm md:w-48 md:shrink-0">
            {start ? (
              <>
                <p className="flex items-center gap-2 font-medium text-fg">
                  <CalendarDays className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
                  {start.date}
                </p>
                <p className="mt-1 pl-6 text-fg-muted">{start.time}</p>
              </>
            ) : (
              <p className="flex items-center gap-2 text-fg">
                <CalendarDays className="h-4 w-4 shrink-0 text-fg-muted" aria-hidden="true" />
                <TextOrNotProvided value={meeting.source_start_time} />
              </p>
            )}
          </div>

          <div className="md:w-36 md:shrink-0">
            <Badge tone={documentCount > 0 ? 'success' : 'neutral'}>
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              {plural(documentCount, 'document')}
            </Badge>
          </div>
        </div>

        <ArrowRight className="hidden h-5 w-5 shrink-0 text-accent md:block" aria-hidden="true" />
      </Link>
    </li>
  );
}

// Meetings page (SRS-220.3): the stored meetings of the towns the signed-in user follows.
export default function MeetingsPage() {
  const state = useMeetingsList();
  const isAdministrator = useIsAdministrator();
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
  const selectedTownName = townsById.get(Number(selectedTownId))?.name ?? ALL_MY_TOWNS;

  return (
    <main className={styles.main}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.17em] text-accent">Your community calendar</p>
          <h1 className="font-display text-4xl font-normal leading-tight tracking-tight sm:text-5xl">Meetings</h1>
          <p className="mt-3 text-sm text-fg-muted">
            Browse local meetings. Open one to see its details and published documents.
          </p>
        </div>
        {/* A link to the retrieval page for administrators only; this page has no retrieval control (SRS-220.3). */}
        {isAdministrator === true ? (
          <Link href="/admin/retrieval" className={buttonClasses({ variant: 'secondary' })}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Retrieval tool
          </Link>
        ) : null}
      </header>

      {state.status === 'loading' ? (
        <div className="mt-8 rounded-xl border border-line bg-card">
          <LeafLoader label="Loading stored meetings..." />
        </div>
      ) : state.status === 'signedOut' ? (
        <div className="mt-8 rounded-xl border border-line bg-card">
          <SignedOutNotice className="p-6" message="You must be logged in to view your meetings." />
        </div>
      ) : state.status === 'loadFailed' ? (
        <Alert tone="error" className="mt-8">Could not load stored meetings.</Alert>
      ) : followedTownIds.length === 0 ? (
        <div className="mt-8 space-y-2 rounded-xl border border-line bg-card p-6 text-center">
          <EmptyArt scene="tree" className="mx-auto mb-2 h-auto w-full max-w-[240px]" />
          <p className="text-fg-muted">Choose your towns in Preferences.</p>
          <Link href="/preferences" className="text-accent hover:underline">Go to Preferences</Link>
        </div>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap gap-3">
            <label className="w-full sm:w-64">
              <span className="sr-only">Town</span>
              <select
                value={selectedTownId}
                onChange={(event) => setSelectedTownId(event.target.value)}
                className="min-h-11 w-full rounded-md border border-line bg-card px-3 text-fg"
              >
                <option value="">{ALL_MY_TOWNS}</option>
                {followedTowns.map((town) => (
                  <option key={town.town_id} value={String(town.town_id)}>{town.name}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-sm text-fg-muted">
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{selectedTownName}</span>
              <span aria-hidden="true">·</span>
              <span>{plural(meetings.length, 'meeting')}</span>
            </p>
            {/* GET /api/meetings orders by start_at, newest first, and the page keeps that order. */}
            <p>Newest meeting first</p>
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-line bg-card">
            {meetings.length === 0 ? (
              <div className="p-6 text-center">
                <EmptyArt scene="tree" className="mx-auto h-auto w-full max-w-[240px]" />
                <p className="mt-4 font-semibold text-fg-muted">No meetings are stored for your towns yet.</p>
              </div>
            ) : (
              <>
                <div className="hidden items-center gap-6 border-b border-line bg-raised px-6 py-4 text-sm text-fg-muted md:flex">
                  <span className="w-14 shrink-0" aria-hidden="true" />
                  <span className="flex-1">Meeting</span>
                  <span className="w-48 shrink-0">Date &amp; time</span>
                  <span className="w-36 shrink-0">Materials</span>
                  <span className="w-5 shrink-0" aria-hidden="true" />
                </div>
                <ul className="divide-y divide-line">
                  {meetings.map((meeting) => {
                    const town = townsById.get(meeting.town_id);
                    return (
                      <MeetingRow
                        key={meeting.meeting_id}
                        meeting={meeting}
                        townName={town?.name ?? null}
                        timeZone={town?.meeting_time_zone}
                      />
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </>
      )}
    </main>
  );
}
