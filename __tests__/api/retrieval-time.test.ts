import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentListEntry, DocumentsState } from '../../app/(app)/documents/useDocuments';

// UR-215: SRS-215.1 (time since retrieval on each Documents list entry).

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

const hook = vi.hoisted(() => ({ state: { status: 'loading' } as DocumentsState }));
vi.mock('../../app/(app)/documents/useDocuments', () => ({ useDocuments: () => hook.state }));

import DocumentsPage from '../../app/(app)/documents/page';
import { retrievedAgo } from '../../lib/retrievalTime';

const NOW = Date.UTC(2026, 10, 27, 15, 0, 0); // 11/27/2026 3:00 PM UTC
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function ago(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  hook.state = { status: 'loading' };
});

describe('retrievedAgo (SRS-215.1)', () => {
  it('shows "Retrieved 3 hours ago" for a document retrieved 3 hours and 10 minutes ago (the SRS example)', () => {
    expect(retrievedAgo(ago(3 * HOUR + 10 * MINUTE), NOW)).toBe('Retrieved 3 hours ago');
  });

  it.each([
    [0, 'Retrieved 0 minutes ago'],
    [59 * 1000, 'Retrieved 0 minutes ago'],
    [1 * MINUTE, 'Retrieved 1 minute ago'],
    [42 * MINUTE + 30 * 1000, 'Retrieved 42 minutes ago'],
    [59 * MINUTE + 59 * 1000, 'Retrieved 59 minutes ago'],
  ])('uses minutes under 60 minutes (%i ms)', (ms, text) => {
    expect(retrievedAgo(ago(ms), NOW)).toBe(text);
  });

  it.each([
    [60 * MINUTE, 'Retrieved 1 hour ago'],
    [2 * HOUR, 'Retrieved 2 hours ago'],
    [23 * HOUR + 59 * MINUTE, 'Retrieved 23 hours ago'],
  ])('uses hours from 60 minutes and under 24 hours (%i ms)', (ms, text) => {
    expect(retrievedAgo(ago(ms), NOW)).toBe(text);
  });

  it.each([
    [24 * HOUR, 'Retrieved 1 day ago'],
    [47 * HOUR, 'Retrieved 1 day ago'],
    [3 * DAY + 5 * HOUR, 'Retrieved 3 days ago'],
    [400 * DAY, 'Retrieved 400 days ago'],
  ])('uses days from 24 hours (%i ms)', (ms, text) => {
    expect(retrievedAgo(ago(ms), NOW)).toBe(text);
  });

  it('counts a time a little in the future as 0 minutes', () => {
    expect(retrievedAgo(new Date(NOW + 30 * 1000).toISOString(), NOW)).toBe('Retrieved 0 minutes ago');
  });

  it('reads the database timestamp format with a +00:00 offset', () => {
    expect(retrievedAgo('2026-11-27T11:50:00.123456+00:00', NOW)).toBe('Retrieved 3 hours ago');
  });

  it('is null for a missing or unreadable time', () => {
    expect(retrievedAgo(null, NOW)).toBeNull();
    expect(retrievedAgo('not a time', NOW)).toBeNull();
  });
});

describe('Documents list entry (SRS-215.1)', () => {
  function entry(document_id: number, retrieved_at: string): DocumentListEntry {
    return {
      document_id,
      title: `Document ${document_id}`,
      town_id: 1,
      meeting_id: 9,
      retrieved_at,
      summary_status: 'Complete',
      document_type: 'Agenda',
      town_name: 'Salem',
      meeting_start_at: '2026-11-20T23:00:00+00:00',
      meeting_time_zone: 'America/New_York',
    };
  }

  function render(documents: DocumentListEntry[]): string {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubGlobal('React', React);
    hook.state = { status: 'loaded', documents, followsTowns: true };
    return renderToStaticMarkup(React.createElement(DocumentsPage));
  }

  function entries(markup: string): string[] {
    return Array.from(markup.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g), ([, inner]) => inner.replace(/<[^>]*>/g, ' '));
  }

  it('shows each entry its own time since retrieval', () => {
    const items = entries(
      render([entry(1, ago(3 * HOUR + 10 * MINUTE)), entry(2, ago(25 * MINUTE)), entry(3, ago(5 * DAY))]),
    );

    expect(items).toHaveLength(3);
    expect(items[0]).toContain('Retrieved 3 hours ago');
    expect(items[1]).toContain('Retrieved 25 minutes ago');
    expect(items[2]).toContain('Retrieved 5 days ago');
  });

  it('shows the time on every entry, once', () => {
    const markup = render([entry(1, ago(HOUR)), entry(2, ago(HOUR)), entry(3, ago(HOUR))]);

    expect(markup.match(/Retrieved 1 hour ago/g)).toHaveLength(3);
  });
});
