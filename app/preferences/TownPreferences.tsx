'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

type Town = { town_id: number; name: string; followed: boolean };

const LOAD_ERROR = 'Your followed towns could not be loaded. Please try again.';
const SAVE_ERROR = 'Your followed towns could not be saved. Please try again.';

export default function TownPreferences() {
  const [token, setToken] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [towns, setTowns] = useState<Town[]>([]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Blocks a second save before the disabled button has re-rendered.
  const saveInFlight = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem('access_token');
    setToken(stored);
    if (!stored) { setSignedOut(true); setLoading(false); return; }
    loadTowns(stored);
  }, []);

  async function loadTowns(accessToken: string) {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/followed-towns', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      if (res.status === 401) setSignedOut(true);
      else if (!res.ok) setLoadError(data.error || LOAD_ERROR);
      else setTowns(data.towns ?? []);
    } catch {
      setLoadError(LOAD_ERROR);
    }
    setLoading(false);
  }

  function toggleTown(townId: number) {
    setSaved(false);
    setSaveError('');
    setTowns((current) =>
      current.map((town) => (town.town_id === townId ? { ...town, followed: !town.followed } : town)),
    );
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || saveInFlight.current) return;
    saveInFlight.current = true;
    setSaving(true);
    setSaved(false);
    setSaveError('');
    try {
      const res = await fetch('/api/followed-towns', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ town_ids: towns.filter((town) => town.followed).map((town) => town.town_id) }),
      });
      const data = await res.json();
      if (res.status === 401) setSignedOut(true);
      else if (!res.ok) setSaveError(data.error || SAVE_ERROR);
      else { setTowns(data.towns ?? []); setSaved(true); }
    } catch {
      setSaveError(SAVE_ERROR);
    }
    saveInFlight.current = false;
    setSaving(false);
  }

  if (loading) {
    return <p className="mt-6 text-slate-400">Loading…</p>;
  }

  if (signedOut) {
    return (
      <div className="mt-6 space-y-4">
        <p className="text-slate-300">You must be logged in to manage your preferences.</p>
        <Link href="/login" className="inline-block rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm hover:border-emerald-400 hover:text-emerald-200">
          Go to login
        </Link>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mt-6 space-y-4">
        <p role="alert" className="rounded-xl border border-red-800 bg-red-900/30 p-3 text-sm text-red-300">{loadError}</p>
        <button
          type="button"
          onClick={() => token && loadTowns(token)}
          className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm hover:border-emerald-400 hover:text-emerald-200"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="mt-6">
      <fieldset disabled={saving} className="min-w-0">
        <legend className="text-xs uppercase tracking-widest text-slate-400">Towns</legend>

        {towns.length === 0 ? (
          <p className="mt-3 text-slate-300">No towns are available yet.</p>
        ) : (
          <>
            <ul className="mt-3 space-y-2">
              {towns.map((town) => (
                <li key={town.town_id}>
                  <label className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100">
                    <input
                      type="checkbox"
                      checked={town.followed}
                      onChange={() => toggleTown(town.town_id)}
                      className="h-4 w-4 shrink-0 accent-emerald-400"
                    />
                    <span className="min-w-0 break-words">{town.name}</span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="submit"
              className="mt-4 rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
      </fieldset>

      {saved ? (
        <p role="status" className="mt-4 rounded-xl border border-slate-700 bg-slate-800/80 p-3 text-sm text-slate-100">
          Town preferences saved.
        </p>
      ) : null}
      {saveError ? (
        <p role="alert" className="mt-4 rounded-xl border border-red-800 bg-red-900/30 p-3 text-sm text-red-300">{saveError}</p>
      ) : null}
    </form>
  );
}
