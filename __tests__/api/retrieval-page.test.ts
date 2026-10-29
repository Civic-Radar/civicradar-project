import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RetrievalTown, RetrievalTownsState } from '../../app/admin/retrieval/useRetrievalTowns';

// @types/react-dom is not installed, so react-dom/server is loaded with only the
// one function this file uses typed here.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

// The page and the Sidebar get their data only through these hooks, so each is
// replaced by whatever state a test sets. No fetch, no localStorage, no effects.
const hooks = vi.hoisted(() => ({
  towns: { status: 'loading' } as RetrievalTownsState,
  isAdministrator: null as boolean | null,
  redirects: [] as string[],
}));

vi.mock('../../app/admin/retrieval/useRetrievalTowns', () => ({
  useRetrievalTowns: () => hooks.towns,
}));

vi.mock('../../app/admin/retrieval/useIsAdministrator', () => ({
  useIsAdministrator: () => hooks.isAdministrator,
}));

// redirect() ends rendering by throwing in Next, so the stand-in throws too.
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  redirect: (url: string) => {
    hooks.redirects.push(url);
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

import RetrievalPage from '../../app/admin/retrieval/page';
import { ALL_TOWNS, runAllTowns, townsToRun, type FetchLike } from '../../app/admin/retrieval/runAllTowns';
import Sidebar from '../../app/components/Sidebar';
import MeetingsPage from '../../app/(app)/meetings/page';

const CONSOLE_METHODS = ['log', 'error', 'warn', 'info', 'debug'] as const;

const SALEM: RetrievalTown = { town_id: 1, name: 'Salem', source_account_id: 'salemma', meeting_time_zone: 'America/New_York' };
const BROOKLINE: RetrievalTown = { town_id: 10, name: 'Brookline', source_account_id: 'brooklinema', meeting_time_zone: 'America/New_York' };
const TOWNS = [BROOKLINE, SALEM];

type Call = { url: string; method: string | undefined; authorization: string | null; body: unknown };

// Stand-in for the retrieval route: records each request and answers with the
// response a test gives for that town id (a status and body, or a thrown error).
function fakeRetrievalRoute(answers: Record<number, { status: number; body: unknown } | 'network error'>) {
  const calls: Call[] = [];
  const fetchFn: FetchLike = async (url, init) => {
    const body = JSON.parse(String(init.body)) as { townId: number };
    calls.push({ url, method: init.method, authorization: new Headers(init.headers).get('Authorization'), body });
    const answer = answers[body.townId] ?? { status: 200, body: { saved: 0, complete: true } };
    if (answer === 'network error') throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(answer.body), { status: answer.status });
  };
  return { calls, fetchFn };
}

// Vitest compiles this project's JSX to React.createElement, and the pages do
// not import React, so React is stubbed as a global for the render.
function render(component: () => React.ReactNode): string {
  return renderToStaticMarkup(React.createElement(component as React.FC));
}

function count(markup: string, tag: string): number {
  return Array.from(markup.matchAll(new RegExp(`<${tag}\\b`, 'g'))).length;
}

function optionTexts(markup: string): string[] {
  return Array.from(markup.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/g), ([, inner]) => inner);
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
  hooks.towns = { status: 'loading' };
  hooks.isAdministrator = null;
  hooks.redirects = [];
});

describe('Retrieval for one chosen town (SRS-220.3 AC 2)', () => {
  it('choosing Brookline sends one retrieval request, for Brookline only', async () => {
    const route = fakeRetrievalRoute({ [BROOKLINE.town_id]: { status: 200, body: { saved: 30, complete: false } } });

    const results = await runAllTowns(townsToRun(TOWNS, String(BROOKLINE.town_id)), route.fetchFn, 'admin-token');

    expect(route.calls).toEqual([
      { url: '/api/retrieval/meetings', method: 'POST', authorization: 'Bearer admin-token', body: { townId: BROOKLINE.town_id } },
    ]);
    expect(results).toEqual([
      { town_id: BROOKLINE.town_id, name: 'Brookline', failed: false, text: 'Brookline: finished, 30 meetings saved. Not every page was read.' },
    ]);
  });

  it('no choice runs no town', async () => {
    const route = fakeRetrievalRoute({});

    expect(townsToRun(TOWNS, '')).toEqual([]);
    expect(await runAllTowns(townsToRun(TOWNS, ''), route.fetchFn, 'admin-token')).toEqual([]);
    expect(route.calls).toEqual([]);
  });
});

describe('Retrieval for all towns (SRS-220.3 AC 3)', () => {
  it('sends one request per town, in the listed order', async () => {
    const route = fakeRetrievalRoute({});

    await runAllTowns(townsToRun(TOWNS, ALL_TOWNS), route.fetchFn, 'admin-token');

    expect(route.calls.map((call) => call.body)).toEqual([{ townId: BROOKLINE.town_id }, { townId: SALEM.town_id }]);
  });

  it('waits for each town to finish before starting the next', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchFn: FetchLike = async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return new Response(JSON.stringify({ saved: 1, complete: true }), { status: 200 });
    };

    await runAllTowns(TOWNS, fetchFn, 'admin-token');

    expect(maxInFlight).toBe(1);
  });

  it.each<[string, { status: number; body: unknown } | 'network error', string]>([
    ['an error status', { status: 502, body: { error: 'Could not list files.' } }, 'Brookline: failed (status 502).'],
    ['a network error', 'network error', 'Brookline: failed.'],
  ])('a failed town (%s) does not stop the next one, and each result is reported', async (_label, answer, failedText) => {
    const route = fakeRetrievalRoute({
      [BROOKLINE.town_id]: answer,
      [SALEM.town_id]: { status: 200, body: { saved: 45, complete: true } },
    });
    const reported: string[] = [];

    const results = await runAllTowns(TOWNS, route.fetchFn, 'admin-token', (result) => reported.push(result.text));

    expect(route.calls.map((call) => call.body)).toEqual([{ townId: BROOKLINE.town_id }, { townId: SALEM.town_id }]);
    expect(results.map((result) => [result.name, result.failed])).toEqual([['Brookline', true], ['Salem', false]]);
    expect(reported).toEqual([failedText, 'Salem: finished, 45 meetings saved.']);
  });

  it('never shows the route error text', async () => {
    const route = fakeRetrievalRoute({ [SALEM.town_id]: { status: 500, body: { error: 'Could not read town: secret detail' } } });

    const [result] = await runAllTowns([SALEM], route.fetchFn, 'admin-token');

    expect(result.text).toBe('Salem: failed (status 500).');
  });
});

describe('Retrieval page for a system administrator', () => {
  it('shows a heading, each supported town plus All towns, and one Run retrieval button', () => {
    hooks.isAdministrator = true;
    hooks.towns = { status: 'loaded', token: 'admin-token', towns: TOWNS };

    const markup = render(RetrievalPage);

    expect(count(markup, 'h1')).toBe(1);
    expect(optionTexts(markup)).toEqual(['Choose a town', 'Brookline', 'Salem', 'All towns']);
    expect(count(markup, 'button')).toBe(1);
    expect(markup).toContain('Run retrieval');
    // Nothing is chosen yet, so the button starts disabled.
    expect(markup).toMatch(/<button[^>]*disabled=""/);
  });
});

describe('Administrators only (SRS-220.3 AC 4)', () => {
  it.each<[string, boolean | null]>([
    ['not an administrator', false],
    ['still being checked', null],
  ])('the retrieval page shows no heading and no retrieval control when the user is %s', (_label, isAdministrator) => {
    hooks.isAdministrator = isAdministrator;
    hooks.towns = { status: 'loaded', token: 'user-token', towns: TOWNS };

    const markup = render(RetrievalPage);

    expect(count(markup, 'h1')).toBe(0);
    expect(count(markup, 'button')).toBe(0);
    expect(count(markup, 'select')).toBe(0);
    expect(markup).not.toContain('Run retrieval');
    expect(markup).not.toContain('Brookline');
    if (isAdministrator === false) expect(markup).toContain('Not available.');
  });

  it.each<[string, boolean | null]>([
    ['not an administrator', false],
    ['still being checked', null],
  ])('the Sidebar shows no retrieval link when the user is %s', (_label, isAdministrator) => {
    hooks.isAdministrator = isAdministrator;

    const links = hrefs(render(Sidebar));

    expect(links).toContain('/dashboard');
    expect(links).not.toContain('/admin/retrieval');
  });

  it('the Sidebar shows the retrieval link to a system administrator', () => {
    hooks.isAdministrator = true;

    expect(hrefs(render(Sidebar))).toContain('/admin/retrieval');
  });
});

describe('Old /meetings page', () => {
  // The list loads in an effect, which does not run here, so the page renders its loading state.
  it('keeps the Meetings list, does not redirect and renders no retrieval control', () => {
    const markup = render(MeetingsPage);

    expect(markup).toMatch(/<h1[^>]*>Meetings<\/h1>/);
    expect(markup).toContain('Loading stored meetings...');
    expect(markup).not.toContain('Run retrieval');
    expect(count(markup, 'button')).toBe(0);
    expect(hooks.redirects).toEqual([]);
  });
});
