'use client';

// SRS-104.6, KJ, Town source settings
// SRS-104.1, KJ, Catalog management access
// SRS-104.4, KJ, Catalog entry removal

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useIsAdministrator } from '../retrieval/useIsAdministrator';
import CatalogRemoveButton from './CatalogRemoveButton';
import TopicCatalog from './TopicCatalog';

type Town = { town_id: number; name: string; source_account_id: string; meeting_time_zone: string };
type TownField = 'name' | 'source_account_id' | 'meeting_time_zone';

const emptyForm: Record<TownField, string> = { name: '', source_account_id: '', meeting_time_zone: '' };

const COMMON_TIME_ZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
];

export default function TownSettingsPage() {
  const [token, setToken] = useState<string | null>(null);
  const isAdministrator = useIsAdministrator();
  const [loading, setLoading] = useState(true);
  const [towns, setTowns] = useState<Town[]>([]);

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [missingFields, setMissingFields] = useState<TownField[]>([]);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('access_token');
    setToken(stored);
    if (!stored) { setLoading(false); return; }
    fetchTowns(stored);
  }, []);

  async function fetchTowns(accessToken: string) {
    setLoading(true);
    const res = await fetch('/api/towns', { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    setLoading(false);
    if (res.ok) setTowns(data.towns);
    else setError(data.error || 'Failed to load towns.');
  }

  function updateField(field: TownField, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setMissingFields((current) => current.filter((f) => f !== field));
  }

  function startEdit(town: Town) {
    setEditingId(town.town_id);
    setForm({ name: town.name, source_account_id: town.source_account_id, meeting_time_zone: town.meeting_time_zone });
    setError('');
    setMissingFields([]);
    setSuccess('');
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
    setMissingFields([]);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setSaving(true);
    setError('');
    setMissingFields([]);
    setSuccess('');

    const res = await fetch(editingId === null ? '/api/towns' : `/api/towns/${editingId}`, {
      method: editingId === null ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error || 'Failed to save town.');
      setMissingFields(data.missingFields ?? []);
      return;
    }

    setSuccess(`Saved ${data.town.name} (${data.town.source_account_id}, ${data.town.meeting_time_zone}).`);
    resetForm();
    fetchTowns(token);
  }

  function inputClass(field: TownField) {
    const border = missingFields.includes(field) ? 'border-danger-vivid' : 'border-line focus:border-accent-strong';
    return `mt-1 w-full rounded-xl border ${border} bg-surface px-4 py-3 text-fg outline-none transition`;
  }

  if (loading || isAdministrator === null) {
    return (
      <main className="min-h-screen bg-surface text-fg flex items-center justify-center">
        <p className="text-fg-subtle">Loading…</p>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-surface text-fg flex items-center justify-center px-6">
        <section className="text-center space-y-4">
          <p className="text-fg-muted">You must be logged in to manage towns.</p>
          <Link href="/login" className="inline-block rounded-full border border-line bg-raised px-4 py-2 text-sm hover:border-accent-strong hover:text-accent-soft">
            Go to login
          </Link>
        </section>
      </main>
    );
  }

  if (!isAdministrator) {
    return (
      <main className="min-h-screen bg-surface text-fg flex items-center justify-center px-6">
        <section className="text-center space-y-4">
          <p role="alert" className="text-fg-muted">Only a system administrator can manage the catalog.</p>
          <Link href="/dashboard" className="inline-block rounded-full border border-line bg-raised px-4 py-2 text-sm hover:border-accent-strong hover:text-accent-soft">
            Go to dashboard
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface text-fg flex items-center justify-center px-6 py-12">
      <section className="w-full max-w-xl rounded-3xl border border-raised bg-card/90 p-8 shadow-2xl shadow-black/30">
        <p className="text-sm uppercase tracking-[0.25em] text-accent">Administration</p>
        <h1 className="mt-4 text-3xl font-semibold">Town source settings</h1>

        {error ? (
          <p role="alert" className="mt-4 rounded-xl border border-danger-line bg-danger-wash/30 p-3 text-sm text-danger">{error}</p>
        ) : null}
        {success ? (
          <p role="status" className="mt-4 rounded-xl border border-accent-line bg-accent-wash/30 p-3 text-sm text-accent-soft">{success}</p>
        ) : null}

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold">{editingId === null ? 'Add a town' : 'Edit town'}</h2>

          <label className="block text-sm text-fg-soft">
            Town name
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              aria-invalid={missingFields.includes('name')}
              className={inputClass('name')}
              placeholder="Salem"
            />
          </label>

          <label className="block text-sm text-fg-soft">
            Source account identifier
            <input
              type="text"
              value={form.source_account_id}
              onChange={(e) => updateField('source_account_id', e.target.value)}
              aria-invalid={missingFields.includes('source_account_id')}
              className={inputClass('source_account_id')}
              placeholder="salemma"
            />
            <span className="mt-1 block text-xs text-fg-subtle">The town&apos;s CivicClerk account, e.g. salemma for salemma.portal.civicclerk.com</span>
          </label>

          <label className="block text-sm text-fg-soft">
            Meeting time zone
            <input
              type="text"
              list="time-zones"
              value={form.meeting_time_zone}
              onChange={(e) => updateField('meeting_time_zone', e.target.value)}
              aria-invalid={missingFields.includes('meeting_time_zone')}
              className={inputClass('meeting_time_zone')}
              placeholder="America/New_York"
            />
            <datalist id="time-zones">
              {COMMON_TIME_ZONES.map((zone) => <option key={zone} value={zone} />)}
            </datalist>
          </label>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-accent-strong px-4 py-3 font-semibold text-surface transition hover:bg-accent disabled:opacity-70"
            >
              {saving ? 'Saving…' : 'Save town'}
            </button>
            {editingId !== null ? (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-xl border border-line bg-raised px-4 py-3 text-sm hover:border-line-strong"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>

        <div className="mt-10">
          <h2 className="text-lg font-semibold">Towns</h2>
          {towns.length === 0 ? (
            <p className="mt-2 text-sm text-fg-subtle">No towns yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-raised rounded-xl border border-raised">
              {towns.map((town) => (
                <li key={town.town_id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div>
                    <p className="font-medium">{town.name}</p>
                    <p className="text-xs text-fg-subtle">{town.source_account_id} · {town.meeting_time_zone}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEdit(town)}
                      className="rounded-full border border-line bg-raised px-3 py-1 text-xs hover:border-accent-strong hover:text-accent-soft"
                    >
                      Edit
                    </button>
                    <CatalogRemoveButton
                      kind="town"
                      id={town.town_id}
                      name={town.name}
                      token={token}
                      onRemoved={(name) => {
                        setSuccess(`Removed ${name}. Residents no longer see it in their town list.`);
                        if (editingId === town.town_id) resetForm();
                        fetchTowns(token);
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <TopicCatalog token={token} />

        <p className="mt-8 text-sm text-fg-muted">
          Back to <Link href="/" className="text-accent hover:underline">home</Link>
        </p>
      </section>
    </main>
  );
}