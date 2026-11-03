import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ListingWindow } from '../../lib/sources/types';

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

// The real client is loaded with importActual, with fetch stubbed, so nothing
// goes live.
vi.mock('../../lib/sources/civicclerk', () => ({
  fetchMeetings: vi.fn(),
  fetchMeetingFiles: vi.fn(),
  fetchAgendaItems: vi.fn(),
  downloadFile: vi.fn(),
}));

import { retrievalMaxPages } from '../../lib/retrieval/maxPages';
import {
  DEFAULT_WINDOW_DAYS_AHEAD,
  DEFAULT_WINDOW_DAYS_BACK,
  retrievalWindow,
} from '../../lib/retrieval/retrievalWindow';
import { runTownRetrieval, type RetrievalSource } from '../../lib/retrieval/runTownRetrieval';

type CivicClerkClient = typeof import('../../lib/sources/civicclerk');
type Row = Record<string, unknown>;
type FakeClient = Parameters<typeof runTownRetrieval>[0];

const TOWN = {
  town_id: 1,
  source_account_id: 'town-a',
  meeting_time_zone: 'America/New_York',
  provides_agenda_items: false,
};

// The fixed current time for every test.
const NOW = new Date('2026-11-03T15:30:00.000Z');

// 90 days before and 30 days after NOW, whole UTC days.
const DEFAULT_WINDOW: ListingWindow = { from: '2026-08-05T00:00:00Z', to: '2026-12-03T23:59:59Z' };
// 7 days back and 0 ahead.
const SHORT_WINDOW: ListingWindow = { from: '2026-10-27T00:00:00Z', to: '2026-11-03T23:59:59Z' };

const EVENTS_URL = 'https://town-a.api.civicclerk.com/v1/Events';
const UNFILTERED_URL = `${EVENTS_URL}?$orderby=startDateTime desc`;

function firstUrl(window: ListingWindow): string {
  const filter = encodeURIComponent(`startDateTime ge ${window.from} and startDateTime le ${window.to}`);
  return `${EVENTS_URL}?$filter=${filter}&$orderby=startDateTime desc`;
}

// The page after `url`, as the source would link it: the filter and the order
// kept, with a skip added.
function nextLink(url: string, skip: number): string {
  return `${url.replace('startDateTime desc', 'startDateTime%20desc')}&$skip=${skip}`;
}

function event(id: number, startDateTime: string) {
  return {
    id,
    eventName: `Meeting ${id}`,
    categoryId: 1,
    categoryName: 'Board',
    startDateTime,
    eventLocation: null,
    publishedFiles: [],
    agendaId: 0,
    hasAgenda: false,
  };
}

// Serves `pageCount` pages starting at `startUrl`, each linking the next one,
// the last with no next link. Page n holds meetings n*10+1 and n*10+2.
function stubPages(startUrl: string, pageCount: number) {
  const pages = new Map<string, { value: unknown[]; '@odata.nextLink'?: string }>();
  let url = startUrl;
  for (let page = 1; page <= pageCount; page += 1) {
    const next = page < pageCount ? nextLink(startUrl, page * 15) : undefined;
    pages.set(url, {
      value: [event(page * 10 + 1, '2026-11-12T19:00:00Z'), event(page * 10 + 2, '2026-10-08T19:00:00Z')],
      ...(next ? { '@odata.nextLink': next } : {}),
    });
    url = next ?? url;
  }

  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const page = pages.get(String(input));
    if (!page) {
      throw new Error(`Unexpected URL: ${String(input)}`);
    }
    return new Response(JSON.stringify(page), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestedUrls(fetchMock: ReturnType<typeof stubPages>): string[] {
  return fetchMock.mock.calls.map(([input]) => String(input));
}

// Fake Supabase client for a direct run: one check row, no governing bodies,
// meetings keyed like the table's unique key, and no documents.
function createFakeSupabase() {
  const meetings = new Map<string, Row>();
  let nextMeetingId = 501;

  const client = {
    from(table: string) {
      if (table === 'source_checks') {
        return {
          insert: () => ({
            select: () => ({
              single: async () => ({ data: { check_id: 1, started_at: '2026-11-03T15:29:00.000000+00:00' }, error: null }),
            }),
          }),
          update: () => ({ eq: async () => ({ data: null, error: null }) }),
        };
      }

      if (table === 'governing_bodies') {
        return { select: () => ({ eq: () => ({ is: async () => ({ data: [], error: null }) }) }) };
      }

      if (table === 'meetings') {
        return {
          upsert: (rows: Row[]) => {
            const saved = rows.map((row) => {
              const key = `${row.town_id}:${row.source_meeting_id}`;
              const stored = { ...row, meeting_id: meetings.get(key)?.meeting_id ?? nextMeetingId++ };
              meetings.set(key, stored);
              return stored;
            });
            return { select: async () => ({ data: saved.map((row) => ({ meeting_id: row.meeting_id })), error: null }) };
          },
          select: () => ({
            eq: (_column: string, townId: number) => ({
              in: async (_inColumn: string, sourceMeetingIds: string[]) => ({
                data: [...meetings.values()].filter(
                  (row) => row.town_id === townId && sourceMeetingIds.includes(row.source_meeting_id as string),
                ),
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'documents') {
        return {
          select: () => ({ eq: () => ({ in: async () => ({ data: [], error: null }) }) }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
    // The baseline update after a successful check (SRS-404.5), without assertions here.
    rpc: async () => ({ data: null, error: null }),
  };

  return { client, meetings };
}

describe('Retrieval window (SRS-220.1)', () => {
  let real: CivicClerkClient;

  beforeAll(async () => {
    real = await vi.importActual<CivicClerkClient>('../../lib/sources/civicclerk');
  });

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('source client request', () => {
    it('sends the encoded filter with the order on the first meeting request and follows the next link as given', async () => {
      const fetchMock = stubPages(firstUrl(DEFAULT_WINDOW), 2);

      const listing = await real.fetchMeetings('town-a', 5, DEFAULT_WINDOW);

      expect(requestedUrls(fetchMock)).toEqual([
        'https://town-a.api.civicclerk.com/v1/Events?$filter=startDateTime%20ge%202026-08-05T00%3A00%3A00Z%20and%20startDateTime%20le%202026-12-03T23%3A59%3A59Z&$orderby=startDateTime desc',
        'https://town-a.api.civicclerk.com/v1/Events?$filter=startDateTime%20ge%202026-08-05T00%3A00%3A00Z%20and%20startDateTime%20le%202026-12-03T23%3A59%3A59Z&$orderby=startDateTime%20desc&$skip=15',
      ]);
      expect(listing.meetings.map((meeting) => meeting.sourceMeetingId)).toEqual(['11', '12', '21', '22']);
      expect(listing.complete).toBe(true);
    });

    it('sends the same filter on the file pass', async () => {
      const fetchMock = stubPages(firstUrl(DEFAULT_WINDOW), 2);

      const listing = await real.fetchMeetingFiles('town-a', 5, DEFAULT_WINDOW);

      expect(requestedUrls(fetchMock)).toEqual([firstUrl(DEFAULT_WINDOW), nextLink(firstUrl(DEFAULT_WINDOW), 15)]);
      expect([...listing.filesByMeeting.keys()]).toEqual(['11', '12', '21', '22']);
      expect(listing.complete).toBe(true);
    });

    it('sends the request exactly as before when no window is given', async () => {
      const fetchMock = stubPages(UNFILTERED_URL, 1);

      await real.fetchMeetings('town-a', 5);
      await real.fetchMeetingFiles('town-a', 5);

      expect(requestedUrls(fetchMock)).toEqual([UNFILTERED_URL, UNFILTERED_URL]);
    });
  });

  describe('window from the current time', () => {
    // The environment with the two window settings set as given.
    function windowEnv(back: string | undefined, ahead: string | undefined) {
      return { ...process.env, RETRIEVAL_WINDOW_DAYS_BACK: back, RETRIEVAL_WINDOW_DAYS_AHEAD: ahead };
    }

    it('defaults to 90 days back and 30 days ahead, whole UTC days', () => {
      expect(DEFAULT_WINDOW_DAYS_BACK).toBe(90);
      expect(DEFAULT_WINDOW_DAYS_AHEAD).toBe(30);
      expect(retrievalWindow(NOW, windowEnv(undefined, undefined))).toEqual(DEFAULT_WINDOW);
    });

    it('uses RETRIEVAL_WINDOW_DAYS_BACK and RETRIEVAL_WINDOW_DAYS_AHEAD', () => {
      expect(retrievalWindow(NOW, windowEnv('7', '0'))).toEqual(SHORT_WINDOW);
    });

    it.each(['', 'abc', '-5', '1.5', '366'])('falls back to the defaults for the setting %j', (setting) => {
      expect(retrievalWindow(NOW, windowEnv(setting, setting))).toEqual(DEFAULT_WINDOW);
    });
  });

  describe('retrieval run', () => {
    beforeEach(() => {
      vi.stubEnv('RETRIEVAL_WINDOW_DAYS_BACK', '');
      vi.stubEnv('RETRIEVAL_WINDOW_DAYS_AHEAD', '');
    });

    // The real client's listing functions, wrapped so their calls can be read.
    function createSource() {
      const source = {
        fetchMeetings: vi.fn(real.fetchMeetings),
        fetchMeetingFiles: vi.fn(real.fetchMeetingFiles),
        fetchAgendaItems: vi.fn(async () => []),
        downloadFile: vi.fn(),
      };
      return source;
    }

    function run(fake: ReturnType<typeof createFakeSupabase>, source: ReturnType<typeof createSource>, maxPages: number) {
      return runTownRetrieval(fake.client as unknown as FakeClient, TOWN, source as unknown as RetrievalSource, {
        maxPages,
        now: () => NOW,
      });
    }

    it('gives both passes the same window worked out from the current time with the defaults', async () => {
      const fetchMock = stubPages(firstUrl(DEFAULT_WINDOW), 1);
      const fake = createFakeSupabase();
      const source = createSource();

      await run(fake, source, 20);

      expect(source.fetchMeetings).toHaveBeenCalledWith('town-a', 20, DEFAULT_WINDOW);
      expect(source.fetchMeetingFiles).toHaveBeenCalledWith('town-a', 20, DEFAULT_WINDOW);
      expect(requestedUrls(fetchMock)).toEqual([firstUrl(DEFAULT_WINDOW), firstUrl(DEFAULT_WINDOW)]);
    });

    it('uses the window settings in the run', async () => {
      vi.stubEnv('RETRIEVAL_WINDOW_DAYS_BACK', '7');
      vi.stubEnv('RETRIEVAL_WINDOW_DAYS_AHEAD', '0');
      stubPages(firstUrl(SHORT_WINDOW), 1);
      const source = createSource();

      await run(createFakeSupabase(), source, 20);

      expect(source.fetchMeetings).toHaveBeenCalledWith('town-a', 20, SHORT_WINDOW);
      expect(source.fetchMeetingFiles).toHaveBeenCalledWith('town-a', 20, SHORT_WINDOW);
    });

    it('is not complete when the window needs more pages than the limit', async () => {
      const fetchMock = stubPages(firstUrl(DEFAULT_WINDOW), 3);
      const fake = createFakeSupabase();

      const result = await run(fake, createSource(), 2);

      expect(result).toEqual({ ok: true, saved: 4, complete: false });
      // Each pass reads 2 pages and none past the limit.
      expect(requestedUrls(fetchMock)).toHaveLength(4);
      expect(requestedUrls(fetchMock)).not.toContain(nextLink(firstUrl(DEFAULT_WINDOW), 30));
    });

    it('is complete when the window fits within the limit', async () => {
      stubPages(firstUrl(DEFAULT_WINDOW), 2);
      const fake = createFakeSupabase();

      const result = await run(fake, createSource(), 2);

      expect(result).toEqual({ ok: true, saved: 4, complete: true });
      expect([...fake.meetings.values()].map((row) => row.source_meeting_id)).toEqual(['11', '12', '21', '22']);
    });
  });

  describe('page limit', () => {
    it.each([
      ['1', 1],
      ['5', 5],
      ['20', 20],
    ] as const)('lowers the limit to RETRIEVAL_MAX_PAGES %j', (setting, limit) => {
      vi.stubEnv('RETRIEVAL_MAX_PAGES', setting);

      expect(retrievalMaxPages()).toBe(limit);
    });

    it.each(['', 'abc', '0', '-3', '2.5', '21', '99'])('uses 20 for RETRIEVAL_MAX_PAGES %j', (setting) => {
      vi.stubEnv('RETRIEVAL_MAX_PAGES', setting);

      expect(retrievalMaxPages()).toBe(20);
    });
  });
});
