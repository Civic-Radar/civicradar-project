// Tests for SRS-502.6, YA, Agenda item display, on the meeting details page.
//
// SRS-502.6 acceptance: Given Town A's source provides agenda items and a Town A
// meeting has 5 agenda items, When that meeting's details page opens, Then all 5
// agenda items are listed.
import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgendaItem, MeetingDetails, MeetingDetailsState, MeetingDocument } from '../../app/(app)/meetings/[id]/useMeetingDetails';

// @types/react-dom is not installed, so react-dom/server is loaded with only the one function used here.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

// The page gets its data only through these hooks; each test sets the state.
const hooks = vi.hoisted(() => ({ state: { status: 'loading' } as MeetingDetailsState }));

vi.mock('../../app/(app)/meetings/[id]/useMeetingDetails', () => ({ useMeetingDetails: () => hooks.state }));
vi.mock('../../app/admin/retrieval/useIsAdministrator', () => ({ useIsAdministrator: () => null }));

import MeetingDetailsPage from '../../app/(app)/meetings/[id]/page';

const TOWN_A_MEETING: MeetingDetails = {
  meeting_id: 10,
  town_id: 1,
  title: 'School Committee Regular Meeting',
  source_body_name: 'School Committee',
  body_name: 'School Committee',
  source_start_time: null,
  start_at: '2026-11-12T23:00:00Z',
  location: null,
  online_link: null,
  source_url: null,
  town_name: 'Town A',
  meeting_time_zone: 'America/New_York',
  provides_agenda_items: true,
  provides_recordings: false,
};

const FIVE_ITEMS: AgendaItem[] = [
  { agenda_item_id: 101, sort_order: 0, title: 'Call to order', item_text: null },
  { agenda_item_id: 102, sort_order: 1, title: 'Approval of minutes', item_text: 'Approval of minutes' },
  { agenda_item_id: 103, sort_order: 2, title: 'FY27 school budget', item_text: 'Review of the proposed FY27 school budget.' },
  { agenda_item_id: 104, sort_order: 3, title: 'Public comment', item_text: null },
  { agenda_item_id: 105, sort_order: 4, title: 'Adjournment', item_text: null },
];

const AGENDA_DOCUMENT: MeetingDocument = { document_id: 7, title: 'Agenda', document_type: 'Agenda', source_url: 'https://example.com/agenda.pdf' };

function render(options: { meeting?: MeetingDetails; agendaItems?: AgendaItem[]; documents?: MeetingDocument[] } = {}) {
  hooks.state = {
    status: 'loaded',
    meeting: options.meeting ?? TOWN_A_MEETING,
    documents: options.documents ?? [],
    agendaItems: options.agendaItems ?? FIVE_ITEMS,
    followedTownIds: [1],
    followedTopics: [],
  };
  return renderToStaticMarkup(React.createElement(MeetingDetailsPage, { params: { id: '10' } }));
}

// The agenda list's items, as their titles.
function agendaTitles(markup: string): string[] {
  const list = markup.match(/<ol\b[^>]*>([\s\S]*?)<\/ol>/)?.[1] ?? '';
  return [...list.matchAll(/<li\b[^>]*>[\s\S]*?<p[^>]*>([^<]*)<\/p>/g)].map((match) => match[1]);
}

beforeEach(() => {
  vi.stubGlobal('React', React);
});

afterEach(() => {
  vi.unstubAllGlobals();
  hooks.state = { status: 'loading' };
});

describe('Agenda item display on the meeting details page (SRS-502.6)', () => {
  it("lists all 5 of a Town A meeting's agenda items, in agenda order", () => {
    expect(agendaTitles(render())).toEqual([
      'Call to order',
      'Approval of minutes',
      'FY27 school budget',
      'Public comment',
      'Adjournment',
    ]);
  });

  it('numbers the items and gives each an id to link to', () => {
    const markup = render();

    expect(markup).toContain('id="agenda-item-101"');
    expect(markup).toContain('id="agenda-item-105"');
    expect(markup).toMatch(/>5<\/span><p[^>]*>Adjournment</);
  });

  it("shows an item's text under its title, but not when it only repeats the title", () => {
    const markup = render();

    expect(markup).toContain('Review of the proposed FY27 school budget.');
    expect(markup.match(/Approval of minutes/g)).toHaveLength(1);
  });

  it('links to the official agenda for reference when the meeting has an Agenda document', () => {
    const markup = render({ documents: [AGENDA_DOCUMENT] });

    expect(markup).toMatch(/<a href="https:\/\/example\.com\/agenda\.pdf" target="_blank"[^>]*>View the official agenda/);
  });

  it('says no agenda items have been posted yet when the source provides them but the meeting has none', () => {
    const markup = render({ agendaItems: [] });

    expect(markup).toContain('No agenda items have been posted for this meeting yet.');
  });

  it("shows no agenda list when the town's source doesn't provide agenda items (SRS-502.8)", () => {
    const markup = render({ meeting: { ...TOWN_A_MEETING, provides_agenda_items: false } });

    expect(markup).not.toContain('Running order');
    expect(markup).toContain('Not available from this source');
  });
});
