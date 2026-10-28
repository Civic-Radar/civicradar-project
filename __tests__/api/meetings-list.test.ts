import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Meeting, MeetingTown, MeetingsListState } from '../../app/(app)/meetings/useMeetingsList';

// @types/react-dom is not installed, so react-dom/server is loaded with only the
// one function this file uses typed here.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

// The page gets its data only through useMeetingsList, so the hook is replaced by
// whatever state a test sets. No fetch, no localStorage, no effects.
const hook = vi.hoisted(() => ({ state: { status: 'loading' } as MeetingsListState }));

vi.mock('../../app/(app)/meetings/useMeetingsList', () => ({
  useMeetingsList: () => hook.state,
}));

import MeetingsPage from '../../app/(app)/meetings/page';
import { meetingsForUser } from '../../app/(app)/meetings/meetingsForUser';

const CONSOLE_METHODS = ['log', 'error', 'warn', 'info', 'debug'] as const;

const SALEM: MeetingTown = { town_id: 1, name: 'Salem', meeting_time_zone: 'America/New_York' };
const BROOKLINE: MeetingTown = { town_id: 10, name: 'Brookline', meeting_time_zone: 'America/New_York' };
const TOWNS = [SALEM, BROOKLINE];

function meeting(meeting_id: number, town: MeetingTown, title: string): Meeting {
  return {
    meeting_id,
    town_id: town.town_id,
    title,
    source_body_name: null,
    source_start_time: null,
    start_at: '2026-10-01T23:00:00+00:00',
    location: null,
    online_link: null,
    source_url: null,
  };
}

const MEETINGS = [
  meeting(1, SALEM, 'Salem City Council'),
  meeting(2, BROOKLINE, 'Brookline Select Board'),
  meeting(3, SALEM, 'Salem Planning Board'),
  meeting(4, BROOKLINE, 'Brookline School Committee'),
];

// Vitest compiles this project's JSX to React.createElement, and the page does
// not import React, so React is stubbed as a global for the render.
function renderLoaded(followedTownIds: number[]): string {
  hook.state = { status: 'loaded', towns: TOWNS, meetings: MEETINGS, followedTownIds };
  return renderToStaticMarkup(React.createElement(MeetingsPage));
}

function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

// Each body row as its cell texts, in order.
function rows(markup: string): string[][] {
  const body = markup.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
  return Array.from(body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g), ([, row]) =>
    Array.from(row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g), ([, cell]) => textOf(cell)),
  );
}

function headers(markup: string): string[] {
  return Array.from(markup.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g), ([, inner]) => textOf(inner));
}

function options(markup: string): { value: string; text: string; selected: boolean }[] {
  return Array.from(markup.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g), ([, attrs, inner]) => ({
    value: attrs.match(/value="([^"]*)"/)?.[1] ?? '',
    text: inner,
    selected: /\bselected=""/.test(attrs),
  }));
}

function hrefs(markup: string): string[] {
  return Array.from(markup.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g), ([, href]) => href);
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
  hook.state = { status: 'loading' };
});

describe('A user who follows Brookline only (SRS-220.3 AC 2)', () => {
  it('meetingsForUser keeps only Brookline meetings', () => {
    expect(meetingsForUser(MEETINGS, [BROOKLINE.town_id], null).map((m) => m.meeting_id)).toEqual([2, 4]);
  });

  it('the page lists only Brookline meetings, each with its town name in the Town column', () => {
    const markup = renderLoaded([BROOKLINE.town_id]);

    expect(headers(markup).slice(0, 2)).toEqual(['Title', 'Town']);
    expect(rows(markup).map((cells) => cells.slice(0, 2))).toEqual([
      ['Brookline Select Board', 'Brookline'],
      ['Brookline School Committee', 'Brookline'],
    ]);
    expect(markup).not.toContain('Salem');
    expect(hrefs(markup)).toEqual(['/meetings/2', '/meetings/4']);
  });

  it('the heading is Meetings with no town name and no Retrieval label', () => {
    const markup = renderLoaded([BROOKLINE.town_id]);

    expect(markup).toMatch(/<h1[^>]*>Meetings<\/h1>/);
    expect(markup).not.toContain('Retrieval');
    expect(markup).toContain('Civic Radar');
  });
});

describe('A user who follows Salem and Brookline (SRS-220.3 AC 3 and AC 4)', () => {
  it('choosing Brookline in the filter keeps only Brookline meetings', () => {
    const followed = [SALEM.town_id, BROOKLINE.town_id];

    expect(meetingsForUser(MEETINGS, followed, BROOKLINE.town_id).map((m) => m.meeting_id)).toEqual([2, 4]);
  });

  it('All my towns keeps the meetings of both towns, in the given order', () => {
    const followed = [SALEM.town_id, BROOKLINE.town_id];

    expect(meetingsForUser(MEETINGS, followed, null).map((m) => m.meeting_id)).toEqual([1, 2, 3, 4]);
  });

  it('a selected town the user does not follow lists nothing', () => {
    expect(meetingsForUser(MEETINGS, [BROOKLINE.town_id], SALEM.town_id)).toEqual([]);
  });

  it('the filter is labelled Town, starts on All my towns, then lists each followed town by name', () => {
    const markup = renderLoaded([SALEM.town_id, BROOKLINE.town_id]);

    expect(markup).toMatch(/<label[^>]*>Town<select/);
    expect(options(markup)).toEqual([
      { value: '', text: 'All my towns', selected: true },
      { value: String(BROOKLINE.town_id), text: 'Brookline', selected: false },
      { value: String(SALEM.town_id), text: 'Salem', selected: false },
    ]);
  });

  it('the page starts on All my towns and lists the meetings of both towns', () => {
    const markup = renderLoaded([SALEM.town_id, BROOKLINE.town_id]);

    expect(rows(markup).map((cells) => cells.slice(0, 2))).toEqual([
      ['Salem City Council', 'Salem'],
      ['Brookline Select Board', 'Brookline'],
      ['Salem Planning Board', 'Salem'],
      ['Brookline School Committee', 'Brookline'],
    ]);
  });

  it('the filter offers only followed towns', () => {
    const markup = renderLoaded([BROOKLINE.town_id]);

    expect(options(markup).map((option) => option.text)).toEqual(['All my towns', 'Brookline']);
  });
});

describe('A user who follows no towns (SRS-220.3 AC 5)', () => {
  it('meetingsForUser keeps nothing', () => {
    expect(meetingsForUser(MEETINGS, [], null)).toEqual([]);
  });

  it('the page lists no meetings and points to Preferences', () => {
    const markup = renderLoaded([]);

    expect(rows(markup)).toEqual([]);
    expect(markup).not.toContain('<table');
    expect(markup).not.toContain('<select');
    expect(markup).toContain('Choose your towns in Preferences.');
    expect(hrefs(markup)).toEqual(['/preferences']);
  });
});

describe('No retrieval control on the meetings page', () => {
  it.each<[string, number[]]>([
    ['follows towns', [SALEM.town_id, BROOKLINE.town_id]],
    ['follows no towns', []],
  ])('shows no Run retrieval text and no button when the user %s', (_label, followed) => {
    const markup = renderLoaded(followed);

    expect(markup).not.toContain('Run retrieval');
    expect(markup).not.toContain('<button');
  });
});
