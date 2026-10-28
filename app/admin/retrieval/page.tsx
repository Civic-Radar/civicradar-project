'use client';

// SRS-220.3, MS, Retrieval page

import { useState } from 'react';
import { useRetrievalTowns } from './useRetrievalTowns';

type ResultLine = { text: string; failed: boolean };

const ALL_TOWNS = 'all';

// Plain retrieval page: choose a supported town and run retrieval for it
// through POST /api/retrieval/meetings. A run can take minutes and is never retried.
export default function RetrievalPage() {
  const state = useRetrievalTowns();
  const [choice, setChoice] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ResultLine | null>(null);

  async function handleRun() {
    if (state.status !== 'loaded') return;
    const town = state.towns.find((t) => String(t.town_id) === choice);
    if (!town) return;

    setRunning(true);
    setResult(null);
    try {
      const res = await fetch('/api/retrieval/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.token}` },
        body: JSON.stringify({ townId: town.town_id }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const notComplete = data.complete === false ? ' Not every page was read.' : '';
        setResult({ text: `${town.name}: finished, ${data.saved ?? 0} meetings saved.${notComplete}`, failed: false });
      } else {
        setResult({ text: `${town.name}: failed (status ${res.status}).`, failed: true });
      }
    } catch {
      setResult({ text: `${town.name}: failed.`, failed: true });
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="min-h-screen bg-surface px-6 py-12 text-fg">
      <h1 className="text-2xl font-semibold">Meeting retrieval</h1>

      {state.status === 'loading' ? (
        <p className="mt-4 text-fg-muted">Loading…</p>
      ) : state.status === 'signedOut' ? (
        <p className="mt-4 text-fg-muted">You must be logged in to run retrieval.</p>
      ) : state.status === 'loadFailed' ? (
        <p role="alert" className="mt-4 text-danger">The towns could not be loaded. Please try again.</p>
      ) : (
        <div className="mt-4 space-y-4">
          <label className="block text-sm text-fg-muted">
            Town
            <select
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              disabled={running}
              className="mt-1 block rounded border border-line bg-surface px-3 py-2 text-fg"
            >
              <option value="">Choose a town</option>
              {state.towns.map((town) => (
                <option key={town.town_id} value={String(town.town_id)}>{town.name}</option>
              ))}
              <option value={ALL_TOWNS}>All towns</option>
            </select>
          </label>

          <button
            type="button"
            onClick={handleRun}
            disabled={running || choice === '' || choice === ALL_TOWNS}
            className="rounded border border-line bg-surface px-4 py-2 text-fg disabled:opacity-60"
          >
            {running ? 'Running…' : 'Run retrieval'}
          </button>

          {result ? (
            <p role="status" className={result.failed ? 'text-danger' : 'text-fg'}>{result.text}</p>
          ) : null}
        </div>
      )}
    </main>
  );
}
