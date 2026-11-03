'use client';

import { useEffect, useState } from 'react';
import { Vote, X } from 'lucide-react';
import { ELECTION, electionReminder, type ElectionReminder } from '../../lib/electionReminder';

// Remembered per visitor, per election, so a hidden reminder stays hidden.
const DISMISS_KEY = `civic-radar:election-reminder-hidden:${ELECTION.date}`;

/**
 * A slim band at the top of every page around Election Day: the date,
 * poll hours, and a link to the state's official elections page. It works out
 * the day in the browser, so it appears and disappears on its own. The ✕
 * hides it for that visitor on every page and leaves a small "Election Day"
 * button in the bottom corner that brings it back.
 */
export default function ElectionBanner() {
  const [reminder, setReminder] = useState<ElectionReminder | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      // Storage can be blocked; the reminder just shows.
    }
    setReminder(electionReminder(new Date()));
  }, []);

  // Outside the reminder window there is nothing to show or bring back.
  if (!reminder) return null;

  function hide() {
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Hidden for this visit only.
    }
    setHidden(true);
  }

  function show() {
    try {
      window.localStorage.removeItem(DISMISS_KEY);
    } catch {
      // Nothing saved to remove.
    }
    setHidden(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (hidden) {
    return (
      <button
        type="button"
        onClick={show}
        aria-label="Show Election Day reminder"
        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-30 flex min-h-11 items-center gap-2 rounded-full border border-lime/60 bg-accent-strong px-4 text-sm font-semibold text-on-dark shadow-lg transition hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Vote className="h-4 w-4" aria-hidden="true" />
        Election Day
      </button>
    );
  }

  return (
    <div role="region" aria-label="Election Day reminder" className="relative z-20 bg-accent-strong text-on-dark">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-1 py-2.5 pl-5 pr-14 text-sm md:justify-center md:px-14 md:text-center">
        <span>
          <strong className="font-semibold">{reminder.headline}</strong> {reminder.detail}
        </span>
        <a
          href={reminder.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline underline-offset-4 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-dark"
        >
          Find where to vote
        </a>
        <button
          type="button"
          onClick={hide}
          aria-label="Hide Election Day reminder"
          className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-on-dark"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
