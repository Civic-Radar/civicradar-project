import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Meeting, MeetingTown, MeetingsListState } from '../../app/(app)/meetings/useMeetingsList';

// @types/react-dom is not installed, so react-dom/server is loaded with only the
// one function this file uses typed here.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

// The page gets its data only through these hooks, so each is replaced by
// whatever state a test sets. No fetch, no localStorage, no effects.
const hooks = vi.hoisted(() => ({
  state: { status: 'loading' } as MeetingsListState,
  isAdministrator: null as boolean | null,
}));

vi.mock('../../app/(app)/meetings/useMeetingsList', () => ({
  useMeetingsList: () => hooks.state,
}));

vi.mock('../../app/admin/retrieval/useIsAdministrator', () => ({
  useIsAdministrator: () => hooks.isAdministrator,
}));

// Stand-in Supabase for GET /api/meetings. Records each documents read.
const db = vi.hoisted(() => ({
  meetings: [] as Record<string, unknown>[],
  documents: [] as { meeting_id: number }[],
  documentReads: [] as { select: string; column: string; ids: unknown[] }[],
}));

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: () => ({
    from(table: string) {
      if (table === 'towns') {
        return {
          select: () => ({
            is: () => ({
              order: async () => ({ data: [{ town_id: 1, name: 'Salem', meeting_time_zone: 'America/New_York' }], error: null }),
            }),
          }),
        };
      }
      if (table === 'meetings') {
        return { select: () => ({ order: async () => ({ data: db.meetings, error: null }) }) };
      }
      if (table === 'documents') {
        return {
          select: (select: string) => ({
            in: async (column: string, ids: unknown[]) => {
              db.documentReads.push({ select, column, ids });
              return { data: db.documents.filter((row) => ids.includes(row.meeting_id)), error: null };
            },
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));

import MeetingsPage from '../../app/(app)/meetings/page';
import { GET } from '../../app/api/meetings/route';

const CONSOLE_METHODS = ['log', 'error', 'warn', 'info', 'debug'] as const;

const SALEM: MeetingTown = { town_id: 1, name: 'Salem', meeting_time_zone: 'America/New_York' };
const BROOKLINE: MeetingTown = { town_id: 10, name: 'Brookline', meeting_time_zone: 'America/New_York' };

function meeting(overrides: Partial<Meeting> & Pick<Meeting, 'meeting_id' | 'town_id'>): Meeting {
  return {
    title: 'City Council Regular Meeting',
    source_body_name: 'City Council',
    source_start_time: null,
    // 7:00 PM in New York on Oct 19, 2026 (EDT).
    start_at: '2026-10-19T23:00:00+00:00',
    location: '93 Washington Street',
    online_link: 'https://example.com/join',
    source_url: 'https://example.com/meeting',
    document_count: 0,
    ...overrides,
  };
}

function render(meetings: Meeting[], followedTownIds = [SALEM.town_id, BROOKLINE.town_id]): string {
  hooks.state = { status: 'loaded', towns: [SALEM, BROOKLINE], meetings, followedTownIds };
  return renderToStaticMarkup(React.createElement(MeetingsPage));
}

function textOf(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/ /g, ' ');
}

function rowMarkup(markup: string): string[] {
  const list = markup.match(/<ul\b[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? '';
  return Array.from(list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g), ([, row]) => row);
}

function lines(row: string): string[] {
  return Array.from(row.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g), ([, line]) => textOf(line));
}

function count(markup: string, tag: string): number {
  return Array.from(markup.matchAll(new RegExp(`<${tag}\\b`, 'g'))).length;
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
  vi.unstubAllEnvs();
  hooks.state = { status: 'loading' };
  hooks.isAdministrator = null;
  db.meetings = [];
  db.documents = [];
  db.documentReads = [];
});

describe('Meetings page header', () => {
  it('shows the uppercase eyebrow, the title and the subtitle', () => {
    const markup = render([meeting({ meeting_id: 1, town_id: SALEM.town_id })]);

    expect(markup).toMatch(/<p class="[^"]*\buppercase\b[^"]*">Your community calendar<\/p>/);
    expect(markup).toMatch(/<h1[^>]*>Meetings<\/h1>/);
    expect(markup).toContain('Browse local meetings. Open one to see its details and published documents.');
  });

  it('shows a Retrieval tool link to /admin/retrieval for a system administrator, never a button', () => {
    hooks.isAdministrator = true;
    const markup = render([meeting({ meeting_id: 1, town_id: SALEM.town_id })]);

    expect(markup).toMatch(/<a\b[^>]*href="\/admin\/retrieval"[^>]*>[\s\S]*?Retrieval tool<\/a>/);
    expect(count(markup, 'button')).toBe(0);
    expect(markup).not.toContain('Run retrieval');
  });

  it.each<[string, boolean | null]>([
    ['not an administrator', false],
    ['still being checked', null],
  ])('shows no Retrieval tool link when the user is %s', (_label, isAdministrator) => {
    hooks.isAdministrator = isAdministrator;
    const markup = render([meeting({ meeting_id: 1, town_id: SALEM.town_id })]);

    expect(markup).not.toContain('/admin/retrieval');
    expect(markup).not.toContain('Retrieval tool');
    expect(count(markup, 'button')).toBe(0);
    expect(markup).not.toContain('Run retrieval');
  });
});

describe('Meetings page controls and status line', () => {
  it('has exactly one dropdown, the town filter, which lists no governing bodies', () => {
    const markup = render([
      meeting({ meeting_id: 1, town_id: SALEM.town_id, source_body_name: 'City Council' }),
      meeting({ meeting_id: 2, town_id: BROOKLINE.town_id, source_body_name: 'Select Board' }),
    ]);

    expect(count(markup, 'select')).toBe(1);
    const options = Array.from(markup.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/g), ([, text]) => text);
    expect(options).toEqual(['All my towns', 'Brookline', 'Salem']);
    expect(options).not.toContain('City Council');
    expect(options).not.toContain('Select Board');
  });

  it('shows the selected town label, the meeting count and the true sort order', () => {
    const markup = render([
      meeting({ meeting_id: 1, town_id: SALEM.town_id }),
      meeting({ meeting_id: 2, town_id: BROOKLINE.town_id }),
    ]);

    expect(textOf(markup)).toContain('All my towns·2 meetings');
    expect(textOf(markup)).toContain('Newest meeting first');
  });

  it('says 1 meeting for a single meeting', () => {
    const markup = render([meeting({ meeting_id: 1, town_id: SALEM.town_id })]);

    expect(textOf(markup)).toContain('All my towns·1 meeting');
    expect(textOf(markup)).not.toContain('1 meetings');
  });
});

describe('Meetings page rows', () => {
  it('shows the column headings Meeting, Date & time and Materials', () => {
    const markup = render([meeting({ meeting_id: 1, town_id: SALEM.town_id })]);

    expect(textOf(markup)).toContain('MeetingDate & timeMaterials');
  });

  it('each row links to the meeting and shows the date tile, title, body and town, date and time', () => {
    const markup = render([meeting({ meeting_id: 7, town_id: SALEM.town_id })]);
    const [row] = rowMarkup(markup);

    expect(row).toMatch(/^<a\b[^>]*href="\/meetings\/7"/);
    expect(row).toMatch(/<span class="[^"]*uppercase[^"]*">Oct<\/span><span[^>]*>19<\/span>/);
    expect(lines(row)).toEqual([
      'City Council Regular Meeting',
      'City Council · Salem',
      'Oct 19, 2026',
      '7:00 PM EDT',
    ]);
  });

  it('leaves out the governing body and the dot when there is none', () => {
    const markup = render([meeting({ meeting_id: 7, town_id: BROOKLINE.town_id, source_body_name: null })]);

    expect(lines(rowMarkup(markup)[0])[1]).toBe('Brookline');
  });

  it('uses the town time zone for the tile and the time (EST after the clocks change)', () => {
    const markup = render([meeting({ meeting_id: 7, town_id: SALEM.town_id, start_at: '2026-12-11T00:00:00+00:00' })]);
    const [row] = rowMarkup(markup);

    expect(row).toMatch(/>Dec<\/span><span[^>]*>10<\/span>/);
    expect(lines(row).slice(2)).toEqual(['Dec 10, 2026', '7:00 PM EST']);
  });

  it('does not show location, online, recording or source link details in the row', () => {
    const markup = render([meeting({ meeting_id: 7, town_id: SALEM.town_id })]);
    const [row] = rowMarkup(markup);

    expect(row).not.toContain('93 Washington Street');
    expect(row).not.toContain('https://example.com/join');
    expect(row).not.toContain('https://example.com/meeting');
    expect(count(row, 'a')).toBe(1);
  });

  it.each<[number, string, string]>([
    [0, '0 documents', 'bg-raised'],
    [1, '1 document', 'bg-accent-wash'],
    [3, '3 documents', 'bg-accent-wash'],
  ])('a meeting with %i linked documents shows the pill "%s" (%s)', (documentCount, text, tint) => {
    const markup = render([meeting({ meeting_id: 7, town_id: SALEM.town_id, document_count: documentCount })]);
    const [row] = rowMarkup(markup);

    const pill = row.match(/<span class="([^"]*)"><svg[\s\S]*?<\/svg>([^<]*)<\/span>/);
    expect(pill?.[2]).toBe(text);
    expect(pill?.[1]).toContain(tint);
  });
});

describe('GET /api/meetings document_count', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  });

  it('adds each meeting\'s document count from one documents read, keeping the order and fields', async () => {
    db.meetings = [
      { meeting_id: 3, town_id: 1, title: 'C' },
      { meeting_id: 1, town_id: 1, title: 'A' },
      { meeting_id: 2, town_id: 1, title: 'B' },
    ];
    db.documents = [{ meeting_id: 1 }, { meeting_id: 1 }, { meeting_id: 2 }, { meeting_id: 99 }];

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.meetings).toEqual([
      { meeting_id: 3, town_id: 1, title: 'C', document_count: 0 },
      { meeting_id: 1, town_id: 1, title: 'A', document_count: 2 },
      { meeting_id: 2, town_id: 1, title: 'B', document_count: 1 },
    ]);
    expect(body.towns).toEqual([{ town_id: 1, name: 'Salem', meeting_time_zone: 'America/New_York' }]);
    expect(db.documentReads).toEqual([{ select: 'meeting_id', column: 'meeting_id', ids: [3, 1, 2] }]);
  });

  it('makes no documents read when there are no meetings', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect((await response.json()).meetings).toEqual([]);
    expect(db.documentReads).toEqual([]);
  });
});
