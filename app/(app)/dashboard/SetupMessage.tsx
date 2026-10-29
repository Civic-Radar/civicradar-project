'use client';

import Link from 'next/link';
import { ArrowRight, Check, CircleDashed } from 'lucide-react';
import { useEffect, useState } from 'react';
import { buttonClasses } from '../../components/ui/Button';
import { cardClasses } from '../../components/ui/Card';
import { cx } from '../../components/ui/cx';
import {
  getMissingSelection,
  SETUP_MESSAGES,
  SETUP_REASON,
  type MissingSelection,
} from '../../../lib/setupMessage';

type Setup = { missing: MissingSelection; towns: number; topics: number };
type Choice = { followed: boolean };

const countFollowed = (choices: Choice[]) => choices.filter((choice) => choice.followed).length;

// SRS-401.8: names the missing selection (towns, topics, or both) and links to
// preferences. Shows nothing while loading, when signed out, when a request
// fails, or when the resident follows both, so it is never shown by mistake.
export default function SetupMessage() {
  const [setup, setSetup] = useState<Setup | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) return;
    loadSetup(token);
  }, []);

  async function loadSetup(accessToken: string) {
    const headers = { Authorization: `Bearer ${accessToken}` };
    try {
      const [townsRes, topicsRes] = await Promise.all([
        fetch('/api/followed-towns', { headers }),
        fetch('/api/followed-topics', { headers }),
      ]);
      if (!townsRes.ok || !topicsRes.ok) return;

      const [{ towns }, { topics }] = await Promise.all([townsRes.json(), topicsRes.json()]);
      if (!Array.isArray(towns) || !Array.isArray(topics)) return;

      const missing = getMissingSelection(towns, topics);
      if (missing) setSetup({ missing, towns: countFollowed(towns), topics: countFollowed(topics) });
    } catch {
      // Stay hidden; the dashboard's meetings are its main content.
    }
  }

  if (!setup) return null;

  const message = SETUP_MESSAGES[setup.missing];
  return (
    <section
      role="status"
      aria-labelledby="setup-message-title"
      className={cardClasses(
        'relative mt-6 overflow-hidden border-accent/25 bg-gradient-to-br from-accent-wash/80 via-card to-card',
      )}
    >
      {/* Faint radar rings in the corner, echoing the mark on the left. */}
      <span aria-hidden="true" className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full border border-accent/10" />
      <span aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full border border-accent/10" />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
        <RadarMark />

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.17em] text-accent">Finish setting up</p>
          <h2 id="setup-message-title" className="mt-2 font-display text-2xl font-normal leading-tight tracking-tight">
            {message.title}
          </h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-fg-muted">{SETUP_REASON}</p>

          <ul aria-label="Your selections" className="mt-4 flex flex-wrap gap-2">
            <SelectionChip label="Towns" count={setup.towns} />
            <SelectionChip label="Topics" count={setup.topics} />
          </ul>
        </div>

        <Link href="/preferences" className={buttonClasses({ className: 'group shrink-0 self-start sm:self-center' })}>
          {message.link}
          <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform motion-safe:group-hover:translate-x-0.5" />
        </Link>
      </div>
    </section>
  );
}

// A followed selection reads as done; a missing one is dashed, like an empty slot.
function SelectionChip({ label, count }: { label: string; count: number }) {
  const done = count > 0;
  const Icon = done ? Check : CircleDashed;
  return (
    <li
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium',
        done ? 'border-accent/20 bg-accent-wash text-accent-strong' : 'border-dashed border-warning/50 bg-card text-warning',
      )}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      {label}: {done ? `${count} followed` : 'none yet'}
    </li>
  );
}

// A small radar scope: dark face, two rings, and a slow sweep (still when the
// resident prefers reduced motion).
function RadarMark() {
  return (
    <div aria-hidden="true" className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-backdrop ring-4 ring-accent-wash">
      <span className="absolute inset-2 rounded-full border border-lime/20" />
      <span className="absolute inset-[18px] rounded-full border border-lime/25" />
      <span
        className="absolute inset-0 rounded-full motion-safe:animate-[spin_4s_linear_infinite]"
        style={{ background: 'conic-gradient(from 0deg, rgb(var(--color-lime) / 0.5), transparent 75deg)' }}
      />
      <span className="relative h-1.5 w-1.5 rounded-full bg-lime" />
    </div>
  );
}
