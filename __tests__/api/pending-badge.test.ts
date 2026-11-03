import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentListEntry, DocumentsState } from '../../app/(app)/documents/useDocuments';

// @types/react-dom is not installed, so react-dom/server is loaded with only the
// one function this file uses typed here.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

// The page gets its data only through useDocuments, so the hook is replaced by
// whatever state a test sets. No fetch, no localStorage, no effects.
const hook = vi.hoisted(() => ({ state: { status: 'loading' } as DocumentsState }));

vi.mock('../../app/(app)/documents/useDocuments', () => ({
  useDocuments: () => hook.state,
}));

import DocumentsPage from '../../app/(app)/documents/page';

const TOWN_A = 1;
const PENDING_BADGE = 'Summary pending';
const FAILED_BADGE = 'Summary failed';
const READY_BADGE = 'Summary ready';
// The Badge component's pill classes (app/components/ui/Badge.tsx), then the tone.
const PILL = 'inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium leading-tight';
const PENDING_SPAN = `<span class="${PILL} bg-warning/10 text-warning">${PENDING_BADGE}</span>`;
const FAILED_SPAN = `<span class="${PILL} bg-danger-wash text-danger-soft">${FAILED_BADGE}</span>`;
type SummaryStatus = DocumentListEntry['summary_status'];

function entry(document_id: number, title: string, summary_status: SummaryStatus, town_name: string | null = 'Town A'): DocumentListEntry {
  return {
    document_id, title, town_id: TOWN_A, meeting_id: 9, retrieved_at: '2026-10-01T12:00:00+00:00', summary_status,
    document_type: 'Agenda', town_name, meeting_start_at: '2026-10-01T16:00:00+00:00',
  };
}

// The entry's details line under the title: "<Type> · <town> · <date>".
function detailsLine(markup: string): string | undefined {
  return markup.match(/<p class="mt-1 text-sm text-fg-muted">([\s\S]*?)<\/p>/)?.[1];
}

// The entry with its status pill removed.
function withoutPill(markup: string): string {
  return markup.replace(/<span class="inline-flex w-fit[^"]*">[\s\S]*?<\/span>/, '');
}

// Vitest compiles this project's JSX to React.createElement, and the page does
// not import React, so React is stubbed as a global for the render.
function renderLoaded(documents: DocumentListEntry[]): string {
  hook.state = { status: 'loaded', documents };
  return renderToStaticMarkup(React.createElement(DocumentsPage));
}

function listItems(markup: string): string[] {
  return Array.from(markup.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g), ([, inner]) => inner);
}

function anchorsIn(markup: string): { href: string; text: string }[] {
  return Array.from(markup.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g), ([, href, inner]) => ({
    href,
    text: inner.replace(/<[^>]*>/g, ''),
  }));
}

function count(text: string, part: string): number {
  return text.split(part).length - 1;
}

describe('Documents page: Summary pending badge (SRS-206.2)', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    hook.state = { status: 'loading' };
  });

  it('shows the exact badge text once on a Pending entry, and no Summary failed badge', () => {
    const [item] = listItems(renderLoaded([entry(7, 'Agenda', 'Pending')]));

    expect(count(item, PENDING_BADGE)).toBe(1);
    expect(item).toContain(PENDING_SPAN);
    expect(item).not.toContain(FAILED_BADGE);
    expect(item).not.toContain('text-danger');
  });

  it('places the badge on the same row as the town tag', () => {
    const [item] = listItems(renderLoaded([entry(7, 'Agenda', 'Pending')]));

    const area = item.match(/<div class="flex min-w-0 flex-1[^"]*">([\s\S]*)<\/div>/)?.[1] ?? '';
    expect(detailsLine(area)).toContain('Town A');
    expect(area).toContain(PENDING_SPAN);
    expect(area.indexOf(PENDING_SPAN)).toBeGreaterThan(area.indexOf('Town A'));
  });

  it('shows the Summary ready badge, and neither the pending nor the failed one, on a Complete entry', () => {
    const [item] = listItems(renderLoaded([entry(7, 'Agenda', 'Complete')]));

    expect(item).not.toContain(PENDING_BADGE);
    expect(item).not.toContain(FAILED_BADGE);
    expect(count(item, READY_BADGE)).toBe(1);
  });

  it('shows only the Summary failed badge on a Failed entry', () => {
    const [item] = listItems(renderLoaded([entry(7, 'Agenda', 'Failed')]));

    expect(item).not.toContain(PENDING_BADGE);
    expect(count(item, FAILED_BADGE)).toBe(1);
    expect(item).toContain(FAILED_SPAN);
  });

  it('shows each badge only on its own entries in a mixed list', () => {
    const items = listItems(renderLoaded([
      entry(1, 'First', 'Pending'),
      entry(2, 'Second', 'Failed'),
      entry(3, 'Third', 'Complete'),
      entry(4, 'Fourth', 'Pending'),
    ]));

    expect(items.map((inner) => count(inner, PENDING_BADGE))).toEqual([1, 0, 0, 1]);
    expect(items.map((inner) => count(inner, FAILED_BADGE))).toEqual([0, 1, 0, 0]);
  });

  it('still shows the badge on a Pending entry whose town name is null', () => {
    const [item] = listItems(renderLoaded([entry(7, 'Agenda', 'Pending', null)]));

    expect(count(item, PENDING_BADGE)).toBe(1);
    expect(item).toContain(PENDING_SPAN);
    expect(item).not.toContain('Town A');
  });

  it('keeps the title link and town tag of a Pending entry the same as a Complete one', () => {
    const [pending] = listItems(renderLoaded([entry(7, 'Agenda', 'Pending')]));
    const [complete] = listItems(renderLoaded([entry(7, 'Agenda', 'Complete')]));

    expect(anchorsIn(pending)).toEqual([{ href: '/documents/7', text: 'Agenda' }]);
    expect(anchorsIn(pending)).toEqual(anchorsIn(complete));
    expect(detailsLine(pending)).toBe('Agenda · Town A · 10/01/2026');
    expect(withoutPill(pending)).toBe(withoutPill(complete));
  });
});
