import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeetingDetails, MeetingDetailsState, MeetingDocument } from '../../app/(app)/meetings/[id]/useMeetingDetails';

// @types/react-dom is not installed, so react-dom/server is loaded with only the
// one function this file uses typed here.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

// The page gets its data only through these hooks, so each is replaced by
// whatever state a test sets. No fetch, no localStorage, no effects.
const hooks = vi.hoisted(() => ({
  state: { status: 'loading' } as MeetingDetailsState,
  isAdministrator: null as boolean | null,
}));

vi.mock('../../app/(app)/meetings/[id]/useMeetingDetails', () => ({
  useMeetingDetails: () => hooks.state,
}));

vi.mock('../../app/admin/retrieval/useIsAdministrator', () => ({
  useIsAdministrator: () => hooks.isAdministrator,
}));

import MeetingDetailsPage from '../../app/(app)/meetings/[id]/page';

const CONSOLE_METHODS = ['log', 'error', 'warn', 'info', 'debug'] as const;
const NOT_PROVIDED = 'Not provided by the source';
const NOT_AVAILABLE = 'Not available from this source';
const NO_DOCUMENTS = 'No documents have been published for this meeting yet.';

function meeting(overrides: Partial<MeetingDetails> = {}): MeetingDetails {
  return {
    meeting_id: 1165,
    town_id: 1,
    title: 'City Council Regular Meeting',
    source_body_name: 'General',
    body_name: 'City Council',
    source_start_time: '2026-12-10T19:00:00',
    // 7:00 PM in New York on Thursday, Dec 10, 2026 (EST).
    start_at: '2026-12-11T00:00:00+00:00',
    location: 'Council Chambers, 2nd Floor\n93 Washington Street\nSalem, MA 01970',
    online_link: null,
    source_url: 'https://example.portal.civicclerk.com/event/1165/overview',
    town_name: 'Salem',
    meeting_time_zone: 'America/New_York',
    provides_agenda_items: true,
    provides_recordings: false,
    ...overrides,
  };
}

const DOCUMENTS: MeetingDocument[] = [
  { document_id: 7, title: 'Agenda', document_type: 'Agenda', source_url: 'https://example.com/agenda.pdf' },
  { document_id: 8, title: 'Agenda Packet', document_type: 'Packet', source_url: null },
];

function render(options: {
  meeting?: MeetingDetails;
  documents?: MeetingDocument[];
  followedTownIds?: number[] | null;
  followedTopics?: string[];
} = {}): string {
  hooks.state = {
    status: 'loaded',
    meeting: options.meeting ?? meeting(),
    documents: options.documents ?? [],
    followedTownIds: options.followedTownIds === undefined ? [1] : options.followedTownIds,
    followedTopics: options.followedTopics ?? [],
  };
  return renderPage();
}

function renderPage(): string {
  return renderToStaticMarkup(React.createElement(MeetingDetailsPage, { params: { id: '1165' } }));
}

function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/ /g, ' ');
}

function anchors(markup: string): { attrs: string; href: string; text: string }[] {
  return Array.from(markup.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g), ([, attrs, inner]) => ({
    attrs,
    href: attrs.match(/href="([^"]*)"/)?.[1] ?? '',
    text: textOf(inner),
  }));
}

// Each info cell's label and value text, in order.
function cells(markup: string): [string, string][] {
  return Array.from(
    markup.matchAll(/<dt class="text-xs font-semibold uppercase[^"]*">([\s\S]*?)<\/dt><dd[^>]*>([\s\S]*?)<\/dd>/g),
    ([, label, value]) => [textOf(label), textOf(value)],
  );
}

// The small detail lines under the cells.
function smallDetails(markup: string): [string, string][] {
  return Array.from(
    markup.matchAll(/<dt class="font-semibold text-fg-muted">([\s\S]*?)<\/dt><dd class="text-fg-subtle">([\s\S]*?)<\/dd>/g),
    ([, label, value]) => [textOf(label), textOf(value)],
  );
}

function aside(markup: string): string {
  return markup.match(/<aside\b[^>]*>([\s\S]*?)<\/aside>/)?.[1] ?? '';
}

beforeEach(() => {
  vi.stubGlobal('React', React);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error('Network is disabled in tests');
    }),
  );
  for (const method of CONSOLE_METHODS) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

afterEach(() => {
  // Nothing reaches the network and nothing is logged, not even a React warning.
  expect(fetch).not.toHaveBeenCalled();
  for (const method of CONSOLE_METHODS) {
    expect(vi.mocked(console[method])).not.toHaveBeenCalled();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  hooks.state = { status: 'loading' };
  hooks.isAdministrator = null;
});

describe('Meeting details top row', () => {
  it('has a Back to meetings link to /meetings', () => {
    const back = anchors(render()).find((a) => a.text === 'Back to meetings');

    expect(back?.href).toBe('/meetings');
  });

  it('shows a Retrieval tool link to /admin/retrieval for a system administrator, never a retrieval button', () => {
    hooks.isAdministrator = true;
    const markup = render();

    expect(anchors(markup).filter((a) => a.text === 'Retrieval tool').map((a) => a.href)).toEqual(['/admin/retrieval']);
    expect(markup).not.toMatch(/<button\b[^>]*>[^<]*Retrieval/);
    expect(markup).not.toContain('Run retrieval');
  });

  it.each<[string, boolean | null]>([
    ['not an administrator', false],
    ['still being checked', null],
  ])('shows no Retrieval tool link when the user is %s', (_label, isAdministrator) => {
    hooks.isAdministrator = isAdministrator;
    const markup = render();

    expect(markup).not.toContain('Retrieval tool');
    expect(markup).not.toContain('/admin/retrieval');
    expect(markup).not.toContain('Run retrieval');
  });

  it('builds no meeting switcher dropdown and no PROPOSED note', () => {
    const markup = render();

    expect(markup).not.toContain('<select');
    expect(markup).not.toContain('PROPOSED');
  });
});

describe('Meeting details title area', () => {
  it('shows the town chip, the title and "<governing body> · <town>"', () => {
    const markup = render();

    expect(markup).toMatch(/<span class="inline-flex rounded-md border[^"]*">Salem<\/span>/);
    expect(markup).toMatch(/<h1[^>]*>City Council Regular Meeting<\/h1>/);
    expect(textOf(markup)).toContain('City Council · Salem');
  });

  it('shows no Meeting # chip, because the detail response has no source meeting id', () => {
    expect(render()).not.toContain('Meeting #');
  });

  it('falls back to the source body name, and leaves out the body and the dot when both are missing', () => {
    expect(textOf(render({ meeting: meeting({ body_name: null }) }))).toContain('General · Salem');

    const markup = render({ meeting: meeting({ body_name: null, source_body_name: null }) });
    expect(markup).not.toContain(' · Salem');
    expect(smallDetails(markup)).toContainEqual(['Governing body', NOT_PROVIDED]);
  });

  it('shows Not provided by the source for a missing title and town', () => {
    const markup = render({ meeting: meeting({ title: null, town_name: null }) });

    expect(markup).toMatch(new RegExp(`<h1[^>]*><span[^>]*>${NOT_PROVIDED}</span></h1>`));
    expect(textOf(markup)).toContain(`City Council · ${NOT_PROVIDED}`);
  });

  it('shows the Open on CivicClerk link as an outline button that opens the source page in a new tab (SRS-502.9)', () => {
    const [link] = anchors(render()).filter((a) => a.text === 'Open on CivicClerk');

    expect(link.href).toBe('https://example.portal.civicclerk.com/event/1165/overview');
    expect(link.attrs).toContain('target="_blank"');
    expect(link.attrs).toContain('rel="noopener noreferrer"');
    expect(link.attrs).toContain('border-line bg-card');
  });

  it('keeps Not provided by the source for a missing official source link', () => {
    const markup = render({ meeting: meeting({ source_url: null }) });

    expect(markup).not.toContain('Open on CivicClerk');
    expect(smallDetails(markup)).toContainEqual(['Official source link', NOT_PROVIDED]);
  });
});

describe('Meeting details info cells', () => {
  it('shows Date & time, Location and Online participation as uppercase-labelled cells', () => {
    expect(cells(render())).toEqual([
      ['Date & time', 'Thursday, December 10, 20267:00 PM EST'],
      ['Location', 'Council Chambers, 2nd Floor93 Washington StreetSalem, MA 01970'],
      ['Online participation', NOT_PROVIDED],
    ]);
  });

  it('puts the time with its zone on its own line under the long date', () => {
    expect(render()).toMatch(/Thursday, December 10, 2026<span class="mt-1 block[^"]*">7:00[  ]PM EST<\/span>/);
  });

  it('shows the online participation link, and Not provided by the source for missing details', () => {
    const withLink = render({ meeting: meeting({ online_link: 'https://example.com/join' }) });
    expect(anchors(withLink).map((a) => a.href)).toContain('https://example.com/join');

    const missing = render({ meeting: meeting({ start_at: null, source_start_time: null, location: null }) });
    expect(cells(missing).map(([, value]) => value)).toEqual([NOT_PROVIDED, NOT_PROVIDED, NOT_PROVIDED]);
  });

  it('keeps the recordings and agenda items lines the page showed before (SRS-502.8)', () => {
    expect(smallDetails(render())).toEqual([['Recordings', NOT_AVAILABLE]]);
    expect(smallDetails(render({ meeting: meeting({ provides_agenda_items: false }) }))).toEqual([
      ['Agenda items', NOT_AVAILABLE],
      ['Recordings', NOT_AVAILABLE],
    ]);
    expect(smallDetails(render({ meeting: meeting({ provides_recordings: true }) }))).toEqual([]);
  });
});

describe('Meeting details documents', () => {
  it('shows the Published materials eyebrow, the heading and the count', () => {
    const markup = render({ documents: DOCUMENTS });

    expect(markup).toMatch(/<p class="[^"]*uppercase[^"]*">Published materials<\/p>/);
    expect(markup).toMatch(/<h2[^>]*>Meeting documents<\/h2>/);
    expect(textOf(markup)).toContain('2 documents');
  });

  it('lists the documents as before: type badge, title link and Open document', () => {
    const markup = render({ documents: DOCUMENTS });

    expect(anchors(markup).filter((a) => a.href.startsWith('/documents/'))).toEqual([
      expect.objectContaining({ href: '/documents/7', text: 'Agenda' }),
      expect.objectContaining({ href: '/documents/8', text: 'Agenda Packet' }),
    ]);
    expect(anchors(markup).filter((a) => a.text === 'Open document').map((a) => a.href)).toEqual(['https://example.com/agenda.pdf']);
    expect(textOf(markup)).toContain(NOT_PROVIDED);
    expect(markup).not.toContain(NO_DOCUMENTS);
  });

  it('says 1 document for one document', () => {
    expect(textOf(render({ documents: DOCUMENTS.slice(0, 1) }))).toContain('1 document');
  });

  it('shows the empty card with a book icon and the exact message when there are none (SRS-502.5)', () => {
    const markup = render({ documents: [] });

    expect(textOf(markup)).toContain('0 documents');
    expect(markup).toMatch(new RegExp(`<div class="[^"]*rounded-xl[^"]*"><svg\\b[^>]*aria-hidden="true"[\\s\\S]*?</svg><p[^>]*>${NO_DOCUMENTS}</p></div>`));
  });
});

describe('Why this is on your radar panel', () => {
  it('shows the eyebrow, the heading, the town chip, the followed line and the preferences link', () => {
    const panel = aside(render());

    expect(panel).toMatch(/<p class="[^"]*uppercase[^"]*">Why this is on your radar<\/p>/);
    expect(panel).toMatch(/<h2[^>]*>Connected to your community.<\/h2>/);
    expect(textOf(panel)).toContain('Salem is one of the towns you follow. Explore its meeting materials and official source.');
    expect(anchors(panel).filter((a) => a.text === 'Manage your interests').map((a) => a.href)).toEqual(['/preferences']);
  });

  it.each<[string, number[] | null]>([
    ['a town the user does not follow', [10]],
    ['followed towns that could not be read', null],
  ])('leaves out the followed line for %s', (_label, followedTownIds) => {
    const panel = aside(render({ followedTownIds }));

    expect(textOf(panel)).toContain('Salem');
    expect(panel).not.toContain('one of the towns you follow');
  });

  it('shows the followed topics as chips, and no topics block when there are none', () => {
    const withTopics = aside(render({ followedTopics: ['Housing', 'Schools'] }));
    expect(withTopics).toMatch(/<p class="[^"]*uppercase[^"]*">Your followed topics<\/p>/);
    expect(Array.from(withTopics.matchAll(/<li\b[^>]*>([^<]*)<\/li>/g), ([, topic]) => topic)).toEqual(['Housing', 'Schools']);

    expect(aside(render({ followedTopics: [] }))).not.toContain('Your followed topics');
  });
});

describe('Meeting details load states', () => {
  it('shows the loading line, Meeting not found and the load error', () => {
    expect(renderPage()).toContain('Loading meeting...');

    hooks.state = { status: 'notFound' };
    expect(renderPage()).toMatch(/<h1[^>]*>Meeting not found<\/h1>/);

    hooks.state = { status: 'loadFailed', error: 'Could not load the meeting.' };
    expect(renderPage()).toContain('Could not load the meeting.');
  });
});
