'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { alertClasses } from '../../components/ui/Alert';
import { buttonClasses } from '../../components/ui/Button';
import { cardClasses } from '../../components/ui/Card';
import { inputClasses } from '../../components/ui/TextField';

type Profile = { id: string; username: string; biography: string; avatar_url: string | null };

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
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
        <p className="text-fg-subtle">Loading…</p>
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

  return (
    <main className="min-w-0 flex-1 p-4 text-fg sm:p-8">
      <section className="w-full max-w-[650px]">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.17em] text-accent">Profile</p>

        {error ? (
          <p className={alertClasses('error', 'mb-4')}>{error}</p>
        ) : null}

        {profile === null ? (
          <>
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
              <button
                type="submit"
                disabled={creating}
                className={buttonClasses()}
              >
                {creating ? 'Creating…' : 'Create profile'}
              </button>
            </form>
          </>
        ) : (
          <div className={cardClasses('sm:p-8')}>
            <div className="mb-8 flex items-center gap-4 sm:gap-6">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="group relative grid h-[88px] w-[88px] shrink-0 place-items-center overflow-hidden rounded-full bg-accent-wash transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-70"
                title="Change profile photo"
              >
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <span className="font-display text-[39px] leading-none text-fg">
                    {profile.username[0].toUpperCase()}
                  </span>
                )}
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-backdrop/60 text-xs font-semibold text-on-dark opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                  {uploading ? 'Uploading…' : 'Change photo'}
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <h1 className="min-w-0 break-words font-display text-3xl font-normal leading-tight tracking-tight sm:text-4xl">{profile.username}</h1>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-fg-muted">Biography</p>
              {editing ? (
                <div className="mt-3 space-y-3">
                  <textarea
                    value={biography}
                    onChange={(e) => setBiography(e.target.value)}
                    rows={4}
                    className={inputClasses('resize-y leading-[1.8]')}
                  />
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className={buttonClasses()}
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => { setEditing(false); setBiography(profile.biography); }}
                      className={buttonClasses({ variant: 'secondary' })}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="pb-6 pt-4 text-sm text-fg">{profile.biography || 'No biography yet.'}</p>
                  <button
                    onClick={() => setEditing(true)}
                    className={buttonClasses({ variant: 'secondary' })}
                  >
                    Edit biography
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <p className="mt-8 text-sm text-fg-muted">
          Back to <Link href="/" className="text-accent hover:underline">home</Link>
        </p>
      </section>
    </main>
  );
}
