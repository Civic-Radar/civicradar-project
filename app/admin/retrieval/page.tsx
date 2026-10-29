'use client';

// SRS-220.3, MS, Retrieval page

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import Alert from '../../components/ui/Alert';
import { buttonClasses } from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { inputClasses } from '../../components/ui/TextField';
import { ALL_TOWNS, runAllTowns, townsToRun, type TownRunResult } from './runAllTowns';
import { useIsAdministrator } from './useIsAdministrator';
import { useRetrievalTowns } from './useRetrievalTowns';

// Only a system administrator sees the retrieval tool. Everyone else gets no
// heading and no control. The retrieval route still enforces the role itself.
export default function RetrievalPage() {
  const isAdministrator = useIsAdministrator();

  if (isAdministrator === null) {
    return (
      <AdminShell>
        <p className="text-fg-muted">Loading…</p>
      </AdminShell>
    );
  }

  if (!isAdministrator) {
    return (
      <AdminShell>
        <p className="text-fg-muted">Not available.</p>
      </AdminShell>
    );
  }

  return <RetrievalTool />;
}

// Page frame for the admin pages: the app's background, a centered column,
// and a way back to the dashboard.
function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-surface px-4 py-8 text-fg sm:px-8 sm:py-12">
      <div className="mx-auto max-w-[640px]">
        <Link
          href="/dashboard"
          className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to dashboard
        </Link>
        {children}
      </div>
    </main>
  );
}

// Plain retrieval tool: choose a supported town or All towns and run retrieval
// through POST /api/retrieval/meetings, one town at a time. A run can take
// minutes and is never retried.
function RetrievalTool() {
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
    <AdminShell>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.17em] text-accent">Administration</p>
      <h1 className="font-display text-3xl font-normal leading-tight tracking-tight sm:text-4xl">Meeting retrieval</h1>
      <p className="mt-3 text-sm leading-relaxed text-fg-muted">
        Pull the latest meetings and documents from CivicClerk for one town or all towns. A run can take a few minutes.
      </p>

      <Card as="section" className="mt-8">
        {state.status === 'loading' ? (
          <p className="text-fg-muted">Loading…</p>
        ) : state.status === 'signedOut' ? (
          <p className="text-fg-muted">You must be logged in to run retrieval.</p>
        ) : state.status === 'loadFailed' ? (
          <Alert tone="error" role="alert">The towns could not be loaded. Please try again.</Alert>
        ) : (
          <div className="space-y-5">
            <label className="flex flex-col gap-2 text-sm font-semibold text-fg-soft">
              Town
              <select
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
                disabled={running}
                className={inputClasses('cursor-pointer disabled:cursor-not-allowed disabled:opacity-60')}
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
              className={buttonClasses({ variant: 'primary', className: 'w-full sm:w-auto' })}
            >
              {running ? 'Running…' : 'Run retrieval'}
            </button>

            {results.length > 0 ? (
              <ul role="status" className="divide-y divide-line rounded-md border border-line text-sm">
                {results.map((result) => (
                  <li
                    key={result.town_id}
                    className={`px-4 py-3 ${result.failed ? 'bg-danger-wash text-danger-soft' : 'text-fg'}`}
                  >
                    {result.text}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </Card>
    </AdminShell>
  );
}
