import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DocumentListEntry, DocumentsState } from '../../app/(app)/documents/useDocuments';

// SRS-201.4, MS, Setup link: while the setup message (SRS-201.3) is shown, the
// page shows a link to the town selection section.

const hook = vi.hoisted(() => ({ state: { status: 'loading' } as DocumentsState }));
vi.mock('../../app/(app)/documents/useDocuments', () => ({ useDocuments: () => hook.state }));

// The Preferences page's sections are replaced by markers, so the test sees
// their order on the page without running their data loading.
vi.mock('../../app/(app)/preferences/TownPreferences', () => ({ default: () => 'TOWN-SELECTION' }));
vi.mock('../../app/(app)/preferences/TopicPreferences', () => ({ default: () => 'TOPIC-SELECTION' }));
vi.mock('../../app/(app)/preferences/DataFreshness', () => ({ default: () => 'DATA-FRESHNESS' }));

import DocumentsPage from '../../app/(app)/documents/page';
import PreferencesPage from '../../app/(app)/preferences/page';
import { SETUP_LINK_HREF, SETUP_LINK_TEXT, SETUP_MESSAGE } from '../../app/(app)/documents/documentsMessages';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

function render(state: DocumentsState): string {
  vi.stubGlobal('React', React);
  hook.state = state;
  return renderToStaticMarkup(React.createElement(DocumentsPage));
}

function links(markup: string): { href: string; text: string }[] {
  return Array.from(markup.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g), ([, href, inner]) => ({
    href,
    text: inner.replace(/<[^>]*>/g, '').trim(),
  }));
}

const entry: DocumentListEntry = {
  document_id: 1, title: 'Document 1', town_id: 1, meeting_id: 101, retrieved_at: '2026-09-01T12:00:00+00:00',
  summary_status: 'Complete', document_type: 'Agenda', town_name: 'Salem', meeting_start_at: '2026-09-01T23:00:00+00:00',
  meeting_time_zone: 'America/New_York',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Documents page: setup link (SRS-201.4)', () => {
  it('shows exactly one link with the setup message, to the town selection on /preferences', () => {
    const markup = render({ status: 'loaded', documents: [], followsTowns: false });

    expect(markup).toContain(SETUP_MESSAGE);
    expect(links(markup)).toEqual([{ href: '/preferences', text: 'Choose towns to follow' }]);
    expect(SETUP_LINK_HREF).toBe('/preferences');
    expect(SETUP_LINK_TEXT).toBe('Choose towns to follow');
  });

  it('puts the link after the setup message', () => {
    const markup = render({ status: 'loaded', documents: [], followsTowns: false });
    expect(markup.indexOf(SETUP_MESSAGE)).toBeLessThan(markup.indexOf(SETUP_LINK_TEXT));
  });

  it('shows no setup link to a user who follows a town', () => {
    const markup = render({ status: 'loaded', documents: [entry], followsTowns: true });
    expect(markup).not.toContain(SETUP_LINK_TEXT);
  });

  it('shows no setup link while loading or signed out', () => {
    expect(render({ status: 'loading' })).not.toContain(SETUP_LINK_TEXT);
    expect(render({ status: 'signedOut' })).not.toContain(SETUP_LINK_TEXT);
  });
});

describe('Preferences page: the link target opens on the town selection (SRS-201.4)', () => {
  it('has the town selection as its first section', () => {
    vi.stubGlobal('React', React);
    const markup = renderToStaticMarkup(React.createElement(PreferencesPage));

    expect(markup.indexOf('TOWN-SELECTION')).toBeGreaterThan(-1);
    expect(markup.indexOf('TOWN-SELECTION')).toBeLessThan(markup.indexOf('TOPIC-SELECTION'));
    expect(markup.indexOf('TOWN-SELECTION')).toBeLessThan(markup.indexOf('DATA-FRESHNESS'));
  });
});
