'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Camera, Pencil } from 'lucide-react';
import TownSquare from '../../components/TownSquare';
import LeafLoader from '../../components/art/LeafLoader';
import { alertClasses } from '../../components/ui/Alert';
import { buttonClasses } from '../../components/ui/Button';
import { cardClasses } from '../../components/ui/Card';
import { inputClasses } from '../../components/ui/TextField';

type Profile = { id: string; username: string; biography: string; avatar_url: string | null };

// What the profile shows besides the profile itself: the towns and topics the
// user follows, and how many meetings they follow directly. null when it could
// not be read, so that part is left out instead of showing a wrong zero.
type Follows = { towns: string[] | null; topics: string[] | null; meetingCount: number | null };

const LABEL = 'text-xs font-semibold uppercase tracking-[0.14em] text-fg-muted';

// Names of the followed rows from GET /api/followed-towns or /api/followed-topics.
async function followedNames(url: string, key: string, token: string): Promise<string[] | null> {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return ((data[key] ?? []) as { name: string; followed: boolean }[]).filter((row) => row.followed).map((row) => row.name);
  } catch {
    return null;
  }
}

// How many meetings the user follows directly, from GET /api/matching-meetings.
async function followedMeetingCount(token: string): Promise<number | null> {
  try {
    const res = await fetch('/api/matching-meetings', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data.meetings)) return null;
    return (data.meetings as { followed_directly?: boolean }[]).filter((meeting) => meeting.followed_directly).length;
  } catch {
    return null;
  }
}

function listInWords(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [follows, setFollows] = useState<Follows>({ towns: null, topics: null, meetingCount: null });
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [editing, setEditing] = useState(false);
  const [biography, setBiography] = useState('');
  const [saving, setSaving] = useState(false);

  const [creating, setCreating] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newBiography, setNewBiography] = useState('');

  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('access_token');
    setToken(stored);
    if (!stored) { setLoading(false); return; }
    fetchProfile(stored);
    Promise.all([
      followedNames('/api/followed-towns', 'towns', stored),
      followedNames('/api/followed-topics', 'topics', stored),
      followedMeetingCount(stored),
    ]).then(([towns, topics, meetingCount]) => setFollows({ towns, topics, meetingCount }));
  }, []);

  async function fetchProfile(accessToken: string) {
    setLoading(true);
    const res = await fetch('/api/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error || 'Failed to load profile.'); return; }
    setProfile(data.profile);
    if (data.profile) setBiography(data.profile.biography);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setCreating(true);
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: newUsername, biography: newBiography }),
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok) { setProfile(data.profile); setBiography(data.profile.biography); }
    else setError(data.error || 'Failed to create profile.');
  }

  async function handleSave() {
    if (!token) return;
    setSaving(true);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ biography }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) { setProfile(data.profile); setEditing(false); }
    else setError(data.error || 'Failed to save.');
  }

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !token) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/profile/avatar', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    setUploading(false);
    if (res.ok) setProfile(data.profile);
    else setError(data.error || 'Failed to upload image.');
    event.target.value = '';
  }

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
        <section className="space-y-4">
          <p className="text-fg-muted">You must be logged in to view your profile.</p>
          <Link href="/login" className={buttonClasses({ variant: 'primary' })}>
            Go to login
          </Link>
        </section>
      </main>
    );
  }

  if (profile === null) {
    return (
      <main className="min-w-0 flex-1 p-4 text-fg sm:p-8">
        <section className="w-full max-w-[650px]">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.17em] text-accent">Profile</p>
          {error ? <p className={alertClasses('error', 'mb-4')}>{error}</p> : null}
          <h1 className="font-display text-3xl font-normal leading-tight tracking-tight sm:text-4xl">Create your profile</h1>
          <form onSubmit={handleCreate} className={cardClasses('mt-6 space-y-5 sm:p-8 md:mt-8')}>
            <label className="flex flex-col gap-2 text-sm font-semibold text-fg-soft">
              Username
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                required
                className={inputClasses()}
                placeholder="your_username"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold text-fg-soft">
              Biography
              <textarea
                value={newBiography}
                onChange={(e) => setNewBiography(e.target.value)}
                rows={3}
                className={inputClasses('resize-y leading-[1.8]')}
                placeholder="Tell us about yourself…"
              />
            </label>
            <button type="submit" disabled={creating} className={buttonClasses()}>
              {creating ? 'Creating…' : 'Create profile'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  const { towns, topics, meetingCount } = follows;
  const stats: { label: string; value: number | null; href: string }[] = [
    { label: towns?.length === 1 ? 'Town followed' : 'Towns followed', value: towns?.length ?? null, href: '/preferences' },
    { label: topics?.length === 1 ? 'Topic followed' : 'Topics followed', value: topics?.length ?? null, href: '/preferences' },
    { label: meetingCount === 1 ? 'Meeting followed' : 'Meetings followed', value: meetingCount, href: '/dashboard' },
  ];

  return (
    <main className="min-w-0 flex-1 p-4 text-fg sm:p-8">
      <section className="mx-auto w-full max-w-5xl">
        {error ? <p className={alertClasses('error', 'mb-4')}>{error}</p> : null}

        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          {/* Cover: the landing page's town square drawing. */}
          <div className="relative h-40 border-b border-line bg-accent-wash sm:h-52" aria-hidden="true">
            <TownSquare variant="panel" className="pointer-events-none absolute inset-0 h-full w-full" />
          </div>

          {/* Photo overlapping the cover, then the name and the edit button below the cover.
              Stacked on phones; side by side from sm up. */}
          <div className="relative flex flex-col gap-4 px-5 sm:flex-row sm:items-end sm:gap-5 sm:px-7">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Change profile photo"
              className="group relative -mt-12 grid h-24 w-24 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-surface bg-lime shadow-md transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-70 sm:-mt-14 sm:h-28 sm:w-28"
            >
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="font-display text-5xl leading-none text-accent-strong">
                  {profile.username[0]?.toUpperCase()}
                </span>
              )}
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-backdrop/60 text-xs font-semibold text-on-dark opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                <Camera className="h-4 w-4" aria-hidden="true" />
                {uploading ? 'Uploading…' : 'Change photo'}
              </span>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />

            <div className="min-w-0 flex-1 sm:pb-1">
              <p className="text-xs font-semibold uppercase tracking-[0.17em] text-accent">Profile</p>
              <h1 className="mt-1 break-words font-display text-3xl font-normal leading-tight tracking-tight sm:text-4xl">
                {profile.username}
              </h1>
              {towns && towns.length > 0 ? (
                <p className="mt-1 text-sm text-fg-muted">Keeping an eye on {listInWords(towns)}</p>
              ) : null}
            </div>

            {!editing ? (
              <button type="button" onClick={() => setEditing(true)} className={buttonClasses({ variant: 'secondary', className: 'self-start sm:self-end' })}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit profile
              </button>
            ) : null}
          </div>

          {/* What the user follows, at a glance. */}
          <div className="mx-5 mt-6 grid grid-cols-3 gap-2 sm:mx-7 sm:gap-3">
            {stats.map((stat) => (
              <Link
                key={stat.label}
                href={stat.href}
                className="rounded-xl border border-line bg-card px-3 py-3 transition hover:border-accent sm:px-4 sm:py-4"
              >
                <span className="block font-display text-3xl leading-none text-accent-strong sm:text-4xl">{stat.value ?? '—'}</span>
                <span className="mt-1.5 block text-xs leading-snug text-fg-muted sm:text-sm">{stat.label}</span>
              </Link>
            ))}
          </div>

          <div className="grid items-start gap-4 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className={cardClasses('min-w-0')}>
              <p className={LABEL}>About</p>
              {editing ? (
                <div className="mt-3 space-y-3">
                  <label className="sr-only" htmlFor="profile-biography">Biography</label>
                  <textarea
                    id="profile-biography"
                    value={biography}
                    onChange={(e) => setBiography(e.target.value)}
                    rows={4}
                    className={inputClasses('resize-y leading-[1.8]')}
                    placeholder="Tell people what you follow and why…"
                  />
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={handleSave} disabled={saving} className={buttonClasses()}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditing(false); setBiography(profile.biography); }}
                      className={buttonClasses({ variant: 'secondary' })}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-3 whitespace-pre-line break-words leading-relaxed text-fg">
                  {profile.biography || <span className="text-fg-muted">No biography yet. Use Edit profile to add one.</span>}
                </p>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <FollowList title="My towns" names={towns} tone="town" empty="You don't follow any towns yet." />
              <FollowList title="My topics" names={topics} tone="topic" empty="You don't follow any topics yet." />
              <Link
                href="/preferences"
                className="inline-flex min-h-11 items-center gap-2 self-start text-sm font-semibold text-accent hover:underline"
              >
                Change towns and topics in Preferences
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>

        <p className="mt-8 text-sm text-fg-muted">
          Back to <Link href="/dashboard" className="text-accent hover:underline">dashboard</Link>
        </p>
      </section>
    </main>
  );
}

function FollowList({ title, names, tone, empty }: { title: string; names: string[] | null; tone: 'town' | 'topic'; empty: string }) {
  if (names === null) return null;
  return (
    <div className={cardClasses('min-w-0')}>
      <p className={LABEL}>{title}</p>
      {names.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">{empty}</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2">
          {names.map((name) => (
            <li
              key={name}
              className={
                tone === 'town'
                  ? 'rounded-md border border-line-strong bg-card px-2.5 py-1 text-sm font-medium text-fg'
                  : 'rounded-md bg-accent-wash px-2.5 py-1 text-sm font-medium text-accent-strong'
              }
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
