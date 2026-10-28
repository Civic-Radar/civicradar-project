'use client';

import { MapPin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { alertClasses } from '../../components/ui/Alert';
import { buttonClasses } from '../../components/ui/Button';
import { cardClasses } from '../../components/ui/Card';
import SignedOutNotice from '../../components/ui/SignedOutNotice';

type Town = { town_id: number; name: string; followed: boolean };

const LOAD_ERROR = 'Your followed towns could not be loaded. Please try again.';
const SAVE_ERROR = 'Your followed towns could not be saved. Please try again.';

export default function TownPreferences({ onSaved }: { onSaved?: () => void } = {}) {
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
      else { setTowns(data.towns ?? []); setSaved(true); onSaved?.(); }
    } catch {
      setSaveError(SAVE_ERROR);
    }
    saveInFlight.current = false;
    setSaving(false);
  }

  if (loading) {
    return <p className="text-fg-subtle">Loading…</p>;
  }

  if (signedOut) {
    return <SignedOutNotice className="md:col-span-2" message="You must be logged in to manage your preferences." />;
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <p role="alert" className={alertClasses('error')}>{loadError}</p>
        <button
          type="button"
          onClick={() => token && loadTowns(token)}
          className={buttonClasses({ variant: 'secondary' })}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className={cardClasses('min-w-0')}>
      <fieldset disabled={saving} className="min-w-0">
        <legend className="mb-4 flex w-full items-center gap-3 text-lg font-semibold tracking-tight text-fg">
          Towns
          <MapPin aria-hidden="true" className="ml-auto h-5 w-5" />
        </legend>

        {towns.length === 0 ? (
          <p className="text-sm text-fg-muted">No towns are available yet.</p>
        ) : (
          <>
            <ul className="mb-7 flex flex-col gap-2">
              {towns.map((town) => (
                <li key={town.town_id}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-line p-3 text-sm text-fg has-[:checked]:border-line-strong has-[:checked]:bg-accent-wash/50">
                    <input
                      type="checkbox"
                      checked={town.followed}
                      onChange={() => toggleTown(town.town_id)}
                      className="h-4 w-4 shrink-0 accent-accent-strong"
                    />
                    <span className="min-w-0 break-words">{town.name}</span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="submit"
              className={buttonClasses()}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        )}
      </fieldset>

      {saved ? (
        <p role="status" className={alertClasses('success', 'mt-4')}>
          Town preferences saved.
        </p>
      ) : null}
      {saveError ? (
        <p role="alert" className={alertClasses('error', 'mt-4')}>{saveError}</p>
      ) : null}
    </form>
  );
}
