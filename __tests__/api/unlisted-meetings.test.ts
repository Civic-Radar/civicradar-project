import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeetingDetails, MeetingDetailsState } from '../../app/(app)/meetings/[id]/useMeetingDetails';
import type { MeetingFilesListing, MeetingListing, SourceMeeting } from '../../lib/sources/types';

// Defect #498: meeting 5 kept an "Open on CivicClerk" link to CivicClerk event
// 1165 after Salem removed that event, so the link opened a page that never
// loads. After a successful check, a stored meeting that starts inside the
// listing window but is no longer listed is marked (meetings.unlisted_at), the
// details route sends no link for it, and the page says it is no longer listed.

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

type Row = Record<string, unknown>;
type Query = { table: string; op: string; values?: unknown; filters: [string, string, unknown][] };
type Result = { data: unknown; error: { message: string } | null };

// One fake Supabase client for every part of this file. Each query records
// its table, operation, values and filters; db.resolve decides the answer.
const db = vi.hoisted(() => ({
  queries: [] as Query[],
  resolve: (() => ({ data: null, error: null })) as (query: Query, single: boolean) => Result,
  rpcCalls: [] as string[],
}));

const hooks = vi.hoisted(() => ({ state: { status: 'loading' } as MeetingDetailsState }));

vi.mock('../../lib/supabase', () => {
  function chain(table: string) {
    const query: Query = { table, op: '', filters: [] };
    db.queries.push(query);
    const builder: Record<string, unknown> = {};
    for (const op of ['select', 'insert', 'upsert', 'update', 'delete']) {
      builder[op] = (values?: unknown) => {
        if (!query.op || query.op === 'select') {
          if (op !== 'select' || !query.op) query.op = op;
        }
        if (op !== 'select') query.values = values;
        return builder;
      };
    }
    for (const filter of ['eq', 'is', 'in', 'gte', 'lte', 'order', 'limit']) {
      builder[filter] = (column: string, value: unknown) => {
        query.filters.push([filter, column, value]);
        return builder;
      };
    }
    builder.single = async () => db.resolve(query, true);
    builder.maybeSingle = async () => db.resolve(query, true);
    builder.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(db.resolve(query, false)).then(resolve, reject);
    return builder;
  }

  return {
    getSupabaseClient: vi.fn(() => ({
      from: vi.fn((table: string) => chain(table)),
      rpc: vi.fn(async (name: string) => {
        db.rpcCalls.push(name);
        return { data: null, error: null };
      }),
    })),
  };
});

vi.mock('../../app/(app)/meetings/[id]/useMeetingDetails', () => ({ useMeetingDetails: () => hooks.state }));
vi.mock('../../app/admin/retrieval/useIsAdministrator', () => ({ useIsAdministrator: () => null }));

import { getSupabaseClient } from '../../lib/supabase';
import { markUnlistedMeetings } from '../../lib/retrieval/markUnlistedMeetings';
import { runTownRetrieval } from '../../lib/retrieval/runTownRetrieval';
import { GET as getMeeting } from '../../app/api/meetings/[id]/route';
import MeetingDetailsPage from '../../app/(app)/meetings/[id]/page';

const NOW = new Date('2026-11-27T12:00:00Z');
const WINDOW = { from: '2026-08-29T00:00:00Z', to: '2026-12-27T23:59:59Z' };
const DEAD_LINK = 'https://salemma.portal.civicclerk.com/event/1165/overview';
const NO_LONGER_LISTED = 'No longer listed on CivicClerk';

const TOWN = { town_id: 1, source_account_id: 'salemma', meeting_time_zone: 'America/New_York', provides_agenda_items: false };

const LISTED: SourceMeeting = {
  sourceMeetingId: '100',
  title: 'Planning Board',
  sourceBodyId: '1',
  sourceBodyName: 'Planning Board',
  sourceStartTime: '2026-12-03T19:00:00Z',
  location: 'City Hall',
  onlineLink: null,
  sourceUrl: 'https://salemma.portal.civicclerk.com/event/100/overview',
  agendaRef: null,
};

// The stored meetings inside the window that have no mark yet.
const IN_WINDOW = [
  { meeting_id: 5, source_meeting_id: '1165' }, // removed by the source
  { meeting_id: 6, source_meeting_id: '100' }, // still listed
];

function client() {
  return getSupabaseClient()! as unknown as Parameters<typeof markUnlistedMeetings>[0];
}

function updates(): Query[] {
  return db.queries.filter((query) => query.table === 'meetings' && query.op === 'update');
}

function filterValue(query: Query, kind: string, column: string): unknown {
  return query.filters.find(([k, c]) => k === kind && c === column)?.[2];
}

// The answers one retrieval run needs, with the in-window meetings above.
function retrievalResolver(query: Query, single: boolean): Result {
  if (query.table === 'source_checks') {
    return query.op === 'insert'
      ? { data: { check_id: 7, started_at: '2026-11-27T11:59:00+00:00' }, error: null }
      : { data: null, error: null };
  }
  if (query.table === 'governing_bodies') return { data: [], error: null };
  if (query.table === 'meetings') {
    if (query.op === 'upsert') return { data: [{ meeting_id: 6 }], error: null };
    if (query.op === 'update') return { data: null, error: null };
    if (query.filters.some(([kind]) => kind === 'is')) return { data: IN_WINDOW, error: null };
    return { data: single ? null : [], error: null };
  }
  return { data: single ? null : [], error: null };
}

function listing(complete: boolean): MeetingListing {
  return { meetings: [LISTED], complete, pagesRead: 1 } as MeetingListing;
}

function fileListing(complete: boolean): MeetingFilesListing {
  return { filesByMeeting: new Map(), complete, pagesRead: 1 } as MeetingFilesListing;
}

function source(meetingsComplete: boolean, filesComplete = true) {
  return {
    fetchMeetings: vi.fn(async () => listing(meetingsComplete)),
    fetchMeetingFiles: vi.fn(async () => fileListing(filesComplete)),
    fetchAgendaItems: vi.fn(async () => []),
    downloadFile: vi.fn(async () => {
      throw new Error('no download expected');
    }),
  };
}

beforeEach(() => {
  db.queries = [];
  db.rpcCalls = [];
  db.resolve = retrievalResolver;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.mocked(console.log).mockRestore();
  vi.mocked(console.error).mockRestore();
  vi.unstubAllEnvs();
  hooks.state = { status: 'loading' };
});

describe('markUnlistedMeetings (defect #498)', () => {
  it('marks only the in-window meetings the listing left out', async () => {
    const marked = await markUnlistedMeetings(client(), 1, new Set(['100']), WINDOW, NOW);

    expect(marked).toBe(1);
    expect(updates()).toHaveLength(1);
    expect(updates()[0].values).toEqual({ unlisted_at: NOW.toISOString() });
    expect(filterValue(updates()[0], 'in', 'meeting_id')).toEqual([5]);
  });

  it('reads only this town, only unmarked meetings, inside the window narrowed by a day at each end', async () => {
    await markUnlistedMeetings(client(), 1, new Set(['100']), WINDOW, NOW);

    const read = db.queries.find((query) => query.table === 'meetings' && query.op === 'select')!;
    expect(filterValue(read, 'eq', 'town_id')).toBe(1);
    expect(filterValue(read, 'is', 'unlisted_at')).toBeNull();
    expect(filterValue(read, 'gte', 'start_at')).toBe('2026-08-30T00:00:00.000Z');
    expect(filterValue(read, 'lte', 'start_at')).toBe('2026-12-26T23:59:59.000Z');
  });

  it('marks nothing when every in-window meeting was listed', async () => {
    const marked = await markUnlistedMeetings(client(), 1, new Set(['100', '1165']), WINDOW, NOW);

    expect(marked).toBe(0);
    expect(updates()).toEqual([]);
  });

  it('marks nothing and logs when the read fails', async () => {
    db.resolve = () => ({ data: null, error: { message: 'read failed' } });

    expect(await markUnlistedMeetings(client(), 1, new Set(), WINDOW, NOW)).toBe(0);
    expect(updates()).toEqual([]);
    expect(console.error).toHaveBeenCalledWith('Unlisted meetings: town 1 could not read meetings: read failed');
  });

  it('reports nothing marked and logs when the update fails', async () => {
    db.resolve = (query) =>
      query.op === 'update' ? { data: null, error: { message: 'update failed' } } : { data: IN_WINDOW, error: null };

    expect(await markUnlistedMeetings(client(), 1, new Set(['100']), WINDOW, NOW)).toBe(0);
    expect(console.error).toHaveBeenCalledWith('Unlisted meetings: town 1 could not mark meetings: update failed');
  });
});

describe('a retrieval run (defect #498)', () => {
  it('marks the meeting the source removed after a successful check, before the baselines advance', async () => {
    const result = await runTownRetrieval(client() as never, TOWN, source(true), { maxPages: 2, now: () => NOW });

    expect(result).toEqual({ ok: true, saved: 1, complete: true });
    expect(updates().map((query) => filterValue(query, 'in', 'meeting_id'))).toEqual([[5]]);
    expect(db.rpcCalls).toEqual(['process_successful_check']);
  });

  it('clears the mark on every meeting it saves, so a meeting listed again gets its link back', async () => {
    await runTownRetrieval(client() as never, TOWN, source(true), { maxPages: 2, now: () => NOW });

    const upsert = db.queries.find((query) => query.table === 'meetings' && query.op === 'upsert')!;
    expect(upsert.values).toEqual([expect.objectContaining({ source_meeting_id: '100', unlisted_at: null })]);
  });

  it.each([
    ['the meeting listing was incomplete', false, true],
    ['the file listing was incomplete', true, false],
  ])('marks nothing when %s (SRS-221.3)', async (_label, meetingsComplete, filesComplete) => {
    await runTownRetrieval(client() as never, TOWN, source(meetingsComplete, filesComplete), {
      maxPages: 2,
      now: () => NOW,
    });

    expect(updates()).toEqual([]);
    expect(db.rpcCalls).toEqual([]);
  });
});

describe('GET /api/meetings/[id] (defect #498)', () => {
  function meetingRow(unlistedAt: string | null): Row {
    return {
      meeting_id: 5,
      town_id: 1,
      body_id: null,
      title: 'City Council Regular Meeting',
      source_body_name: 'City Council',
      source_start_time: '2026-12-10T19:00:00',
      start_at: '2026-12-11T00:00:00+00:00',
      location: null,
      online_link: null,
      source_url: DEAD_LINK,
      unlisted_at: unlistedAt,
    };
  }

  async function open(unlistedAt: string | null) {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
    db.resolve = (query, single) => {
      if (query.table === 'meetings') return { data: meetingRow(unlistedAt), error: null };
      if (query.table === 'towns') {
        return {
          data: { name: 'Salem', meeting_time_zone: 'America/New_York', provides_agenda_items: false, provides_recordings: false },
          error: null,
        };
      }
      return { data: single ? null : [], error: null };
    };
    const response = await getMeeting(new Request('http://localhost/api/meetings/5'), { params: { id: '5' } });
    return { status: response.status, body: await response.json() };
  }

  it('sends no CivicClerk link for a meeting the source no longer lists', async () => {
    const { status, body } = await open('2026-11-27T12:00:00+00:00');

    expect(status).toBe(200);
    expect(body.meeting.source_url).toBeNull();
    expect(body.meeting.no_longer_listed).toBe(true);
    expect(body.meeting).not.toHaveProperty('unlisted_at');
    expect(JSON.stringify(body)).not.toContain('event/1165');
  });

  it('keeps the link for a listed meeting (SRS-502.9)', async () => {
    const { body } = await open(null);

    expect(body.meeting.source_url).toBe(DEAD_LINK);
    expect(body.meeting.no_longer_listed).toBe(false);
    expect(body.meeting).not.toHaveProperty('unlisted_at');
  });
});

describe('meeting details page (defect #498)', () => {
  function details(overrides: Partial<MeetingDetails>): MeetingDetails {
    return {
      meeting_id: 5,
      town_id: 1,
      title: 'City Council Regular Meeting',
      source_body_name: 'City Council',
      body_name: 'City Council',
      source_start_time: '2026-12-10T19:00:00',
      start_at: '2026-12-11T00:00:00+00:00',
      location: null,
      online_link: null,
      source_url: DEAD_LINK,
      town_name: 'Salem',
      meeting_time_zone: 'America/New_York',
      provides_agenda_items: false,
      provides_recordings: false,
      ...overrides,
    };
  }

  function render(meeting: MeetingDetails): string {
    vi.stubGlobal('React', React);
    hooks.state = {
      status: 'loaded',
      meeting,
      documents: [],
      followedTownIds: [1],
      followedTopics: [],
      matchingMeetings: [],
    } as MeetingDetailsState;
    const markup = renderToStaticMarkup(React.createElement(MeetingDetailsPage, { params: { id: '5' } }));
    vi.unstubAllGlobals();
    return markup;
  }

  it('says the meeting is no longer listed, with no Open on CivicClerk link', () => {
    const markup = render(details({ source_url: null, no_longer_listed: true }));

    expect(markup).toContain(NO_LONGER_LISTED);
    expect(markup).not.toContain('Open on CivicClerk');
    expect(markup).not.toContain('event/1165');
  });

  it('shows the Open on CivicClerk link for a listed meeting (SRS-502.9)', () => {
    const markup = render(details({ no_longer_listed: false }));

    expect(markup).toMatch(new RegExp(`<a href="${DEAD_LINK}"[^>]*>Open on CivicClerk`));
    expect(markup).not.toContain(NO_LONGER_LISTED);
  });

  it('still says "Not provided by the source" when the source never sent a link', () => {
    const markup = render(details({ source_url: null }));

    expect(markup).toContain('Not provided by the source');
    expect(markup).not.toContain(NO_LONGER_LISTED);
  });
});
