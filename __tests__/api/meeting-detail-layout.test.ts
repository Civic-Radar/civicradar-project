import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeetingDetails, MeetingDetailsState, MeetingDocument } from '../../app/(app)/meetings/[id]/useMeetingDetails';
import type { MatchedTopic, MatchingMeeting } from '../../lib/radarReason';

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
  // null renders the real FollowMeetingButton (its first render, before any effect).
  // 'followed' renders a stand-in with the component's markup after Follow succeeds,
  // because a static render cannot press the button.
  follow: null as 'followed' | null,
}));

vi.mock('../../app/(app)/meetings/[id]/FollowMeetingButton', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/(app)/meetings/[id]/FollowMeetingButton')>();
  const React = await import('react');
  function FollowStandIn(props: { meetingId: number }) {
    if (hooks.follow !== 'followed') return React.createElement(actual.default, props);
    return React.createElement(
      'div',
      null,
      React.createElement('button', { type: 'button', 'aria-pressed': true }, 'Unfollow'),
      React.createElement('p', { role: 'status' }, 'You are following this meeting.'),
    );
  }
  return { default: FollowStandIn };
});

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
  matchingMeetings?: MatchingMeeting[] | null;
} = {}): string {
  hooks.state = {
    status: 'loaded',
    meeting: options.meeting ?? meeting(),
    documents: options.documents ?? [],
    followedTownIds: options.followedTownIds === undefined ? [1] : options.followedTownIds,
    followedTopics: options.followedTopics ?? [],
    matchingMeetings: options.matchingMeetings === undefined ? [] : options.matchingMeetings,
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
  hooks.follow = null;
});

// The header actions: the follow wrapper's class list and its inner markup.
function followActions(markup: string): { classes: string[]; inner: string } {
  const header = markup.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1] ?? '';
  const match = header.match(/<div class="([^"]*\brelative\b[^"]*)">([\s\S]*?)<\/div><a\b/);
  const classes = (match?.[1] ?? '').replace(/&amp;/g, '&').replace(/&gt;/g, '>').split(' ');
  return { classes, inner: match?.[2] ?? '' };
}

// The header's class list, the title column's and the actions column's.
function headerLayout(markup: string): { header: string[]; title: string[]; actions: string[] } {
  const match = markup.match(/<header class="([^"]*)"><div class="([^"]*)">[\s\S]*?<\/p><\/div><div class="([^"]*)">/);
  const unescape = (value: string | undefined) =>
    (value ?? '').replace(/&amp;/g, '&').replace(/&gt;/g, '>').split(' ');
  return { header: unescape(match?.[1]), title: unescape(match?.[2]), actions: unescape(match?.[3]) };
}

describe('The header actions stay in place for every title', () => {
  const LONG_TITLE =
    'Housing Advisory Board Hearing and Meeting on the Zoning Amendments for the Village Square Districts and Related Matters';

  it('renders the same header, title column and actions classes for a short and a very long title', () => {
    const short = headerLayout(render({ meeting: meeting({ title: 'Select Board Regular Meeting' }) }));
    const long = headerLayout(render({ meeting: meeting({ title: LONG_TITLE }) }));

    expect(short.header.length).toBeGreaterThan(1);
    expect(long).toEqual(short);
    expect(followActions(render({ meeting: meeting({ title: LONG_TITLE }) })).classes)
      .toEqual(followActions(render()).classes);
  });

  it('uses a two-column grid from md up, with a min-w-0 title column', () => {
    const { header, title } = headerLayout(render());

    expect(header).toEqual(expect.arrayContaining(['flex', 'flex-col', 'md:grid', 'md:grid-cols-[minmax(0,1fr)_auto]', 'md:items-end']));
    expect(header).not.toContain('flex-wrap');
    expect(title).toContain('min-w-0');
  });

  it('keeps the actions column from shrinking or wrapping from md up, and lets it wrap below md', () => {
    const { actions } = headerLayout(render());

    expect(actions).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'md:shrink-0', 'md:flex-nowrap']));
  });
});

describe('Following a meeting does not move the header', () => {
  it('gives the actions wrapper the same classes whether the meeting is followed or not', () => {
    const notFollowed = followActions(render());
    hooks.follow = 'followed';
    const followed = followActions(render());

    expect(notFollowed.classes.length).toBeGreaterThan(1);
    expect(followed.classes).toEqual(notFollowed.classes);
    expect(followed.inner).toContain('You are following this meeting.');
    expect(notFollowed.inner).not.toContain('You are following this meeting.');
  });

  it('takes the note out of the flow, under the button, as one compact line', () => {
    const { classes } = followActions(render());

    expect(classes).toEqual(expect.arrayContaining([
      'relative',
      '[&_[role=status]]:absolute',
      '[&_[role=status]]:left-0',
      '[&_[role=status]]:top-full',
      '[&_[role=status]]:whitespace-nowrap',
      '[&_[role=status]]:text-xs',
    ]));
  });

  it('keeps the note announced (role status) with its text after Follow', () => {
    hooks.follow = 'followed';
    const { inner } = followActions(render());

    expect(inner).toMatch(/<p role="status">You are following this meeting.<\/p>/);
  });

  it('gives the follow button a minimum width that fits Follow and Unfollow', () => {
    const { classes, inner } = followActions(render());

    expect(classes).toContain('[&>div>button]:min-w-[8.5rem]');
    // The real component's button is a direct child of its root div, which the variant targets.
    expect(inner).toMatch(/^<div><button\b/);
  });

  it('keeps Open on CivicClerk right after the follow wrapper in both states', () => {
    for (const follow of [null, 'followed'] as const) {
      hooks.follow = follow;
      const header = render().match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1] ?? '';
      expect(header).toMatch(/<\/div><a\b[^>]*href="https:\/\/example\.portal\.civicclerk\.com\/event\/1165\/overview"/);
    }
  });
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

// SRS-401.5 (#526): the panel shows why this meeting matched, from the user's
// matching result, never the user's whole list of followed topics.
describe('Why this is on your radar panel', () => {
  const HOUSING: MatchedTopic = { topic: 'Housing', evidence_text: 'Vote on the housing production plan.' };
  const MATCHED: MatchingMeeting = { meeting_id: 1165, matched_topics: [HOUSING], followed_directly: false };
  const FOLLOWED_ONLY: MatchingMeeting = { meeting_id: 1165, matched_topics: [], followed_directly: true };

  it('shows the eyebrow, the town chip and the preferences link', () => {
    const panel = aside(render({ matchingMeetings: [MATCHED] }));

    expect(panel).toMatch(/<p class="[^"]*uppercase[^"]*">Why this is on your radar<\/p>/);
    expect(textOf(panel)).toContain('Salem');
    expect(anchors(panel).filter((a) => a.text === 'Manage your interests').map((a) => a.href)).toEqual(['/preferences']);
  });

  it('shows only the topics this meeting matched, each with its agenda text', () => {
    const panel = aside(render({ followedTopics: ['Housing', 'Parking'], matchingMeetings: [MATCHED] }));

    expect(panel).toMatch(/<h2[^>]*>Connected to your community.<\/h2>/);
    expect(textOf(panel)).toContain('Salem is one of the towns you follow, and this agenda mentions topics you follow.');
    expect(panel).toMatch(/<p class="[^"]*uppercase[^"]*">Matched topics<\/p>/);
    expect(Array.from(panel.matchAll(/<li\b[^>]*><span[^>]*>([^<]*)<\/span>/g), ([, topic]) => topic)).toEqual(['Housing']);
    expect(textOf(panel)).toContain('Vote on the housing production plan.');
    expect(panel).not.toContain('Parking');
    expect(panel).not.toContain('Your followed topics');
  });

  it('says the meeting is followed, with no topics block, when it is only followed directly', () => {
    const panel = aside(render({ followedTownIds: [10], matchingMeetings: [FOLLOWED_ONLY] }));

    expect(panel).toMatch(/<h2[^>]*>Connected to your community.<\/h2>/);
    expect(textOf(panel)).toContain('You follow this meeting.');
    expect(panel).not.toContain('Matched topics');
    expect(panel).not.toContain('one of the towns you follow');
  });

  it('says none of the followed topics are on the agenda for an unmatched meeting in a followed town', () => {
    const panel = aside(render({ followedTopics: ['Housing'], matchingMeetings: [] }));

    expect(panel).toMatch(/<h2[^>]*>Not one of your matches.<\/h2>/);
    expect(textOf(panel)).toContain("Salem is one of the towns you follow, but none of your followed topics are on this meeting's agenda.");
    expect(panel).toMatch(/<p class="[^"]*uppercase[^"]*">Your radar<\/p>/);
    expect(panel).not.toContain('Why this is on your radar');
    expect(panel).not.toContain('Housing');
  });

  it('says the town is not followed for an unmatched meeting in another town', () => {
    const panel = aside(render({ followedTownIds: [10], followedTopics: ['Housing'], matchingMeetings: [] }));

    expect(panel).toMatch(/<h2[^>]*>Not one of your matches.<\/h2>/);
    expect(textOf(panel)).toContain("This meeting isn't in a town you follow.");
    expect(panel).toMatch(/<p class="[^"]*uppercase[^"]*">Your radar<\/p>/);
    expect(panel).not.toContain('Why this is on your radar');
    expect(panel).not.toContain('Connected to your community');
    expect(panel).not.toContain('Housing');
  });

  it.each<[string, { followedTownIds?: number[] | null; matchingMeetings: MatchingMeeting[] | null }]>([
    ['the matching result could not be read', { matchingMeetings: null }],
    ['the followed towns could not be read', { followedTownIds: null, matchingMeetings: [] }],
  ])('makes no claim about the match when %s', (_label, options) => {
    const panel = aside(render({ followedTopics: ['Housing'], ...options }));

    expect(panel).toMatch(/<h2[^>]*>About this meeting.<\/h2>/);
    expect(panel).toMatch(/<p class="[^"]*uppercase[^"]*">Your radar<\/p>/);
    expect(panel).not.toContain('Why this is on your radar');
    expect(textOf(panel)).toContain('Salem');
    expect(panel).not.toContain('towns you follow');
    expect(panel).not.toContain("isn't in a town you follow");
    expect(panel).not.toContain('Housing');
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
