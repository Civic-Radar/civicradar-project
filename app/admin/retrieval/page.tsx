'use client';

// SRS-220.3, MS, Retrieval page

import { useState } from 'react';
import { ALL_TOWNS, runAllTowns, townsToRun, type TownRunResult } from './runAllTowns';
import { useRetrievalTowns } from './useRetrievalTowns';

// Plain retrieval page: choose a supported town or All towns and run retrieval
// through POST /api/retrieval/meetings, one town at a time. A run can take
// minutes and is never retried.
export default function RetrievalPage() {
  const state = useRetrievalTowns();
  const [choice, setChoice] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<TownRunResult[]>([]);

  async function handleRun() {
    if (state.status !== 'loaded' || running) return;
    const towns = townsToRun(state.towns, choice);
    if (towns.length === 0) return;

    setRunning(true);
    setResults([]);
    try {
      await runAllTowns(towns, (input, init) => fetch(input, init), state.token, (result) => {
        setResults((current) => [...current, result]);
      });
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
            disabled={running || choice === ''}
            className="rounded border border-line bg-surface px-4 py-2 text-fg disabled:opacity-60"
          >
            {running ? 'Running…' : 'Run retrieval'}
          </button>

          {results.length > 0 ? (
            <ul role="status" className="space-y-1">
              {results.map((result) => (
                <li key={result.town_id} className={result.failed ? 'text-danger' : 'text-fg'}>{result.text}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </main>
  );
}
