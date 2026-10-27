import { readFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MeetingFilesListing, MeetingListing } from '../../lib/sources/types';

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(),
}));

// The route tests mock the source client. The paging tests use the real one
// (loaded with importActual) with fetch stubbed, so nothing goes live.
vi.mock('../../lib/sources/civicclerk', () => ({
  fetchMeetings: vi.fn(),
  fetchMeetingFiles: vi.fn(),
  downloadFile: vi.fn(),
}));

import { getSupabaseClient } from '../../lib/supabase';
import { fetchMeetingFiles, fetchMeetings } from '../../lib/sources/civicclerk';
import { POST } from '../../app/api/retrieval/meetings/route';

type CivicClerkClient = typeof import('../../lib/sources/civicclerk');

// Page 1 of Salem's CivicClerk events, saved unchanged from the API. Its 15
// events are split into two stub pages: the first 8 with a next link, the
// other 7 as the last page.
const FIXTURE_PATH = join(__dirname, '../fixtures/civicclerk-events-salemma.json');
const PAGE_1_SIZE = 8;

type FixtureEvent = { id: number; [field: string]: unknown };
type FixturePage = { value: FixtureEvent[]; '@odata.nextLink'?: string };

function readFixture(): FixturePage {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FixturePage;
}

const FIXTURE = readFixture();
const PAGE_1_URL = 'https://salemma.api.civicclerk.com/v1/Events?$orderby=startDateTime desc';
const PAGE_2_URL = FIXTURE['@odata.nextLink']!;

const PAGE_1: FixturePage = { value: FIXTURE.value.slice(0, PAGE_1_SIZE), '@odata.nextLink': PAGE_2_URL };
const PAGE_2: FixturePage = { value: FIXTURE.value.slice(PAGE_1_SIZE) };

const PAGE_1_IDS = PAGE_1.value.map((event) => String(event.id));
const PAGE_2_IDS = PAGE_2.value.map((event) => String(event.id));

const SALEM_TOWN_ID = 1;

// Serves the two stub pages. page2 'fail' answers page 2 with a 500.
function stubTwoPages(page2: 'ok' | 'fail' = 'ok') {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    if (init?.signal?.aborted) {
      throw init.signal.reason;
    }

    const url = String(input);
    if (url === PAGE_1_URL) {
      return new Response(JSON.stringify(PAGE_1), { status: 200 });
    }
    if (url === PAGE_2_URL) {
      return page2 === 'ok'
        ? new Response(JSON.stringify(PAGE_2), { status: 200 })
        : new Response('Server error', { status: 500 });
    }
    throw new Error(`Unexpected URL: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function requestedUrls(fetchMock: ReturnType<typeof stubTwoPages>): string[] {
  return fetchMock.mock.calls.map(([input]) => String(input));
}

describe('Complete meeting retrieval (SRS-220.1)', () => {
  let real: CivicClerkClient;

  beforeAll(async () => {
    real = await vi.importActual<CivicClerkClient>('../../lib/sources/civicclerk');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('source client paging', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('returns meetings from both pages and is complete only after page 2 is read', async () => {
      const fetchMock = stubTwoPages();

      const listing = await real.fetchMeetings('salemma', 2);

      expect(requestedUrls(fetchMock)).toEqual([PAGE_1_URL, PAGE_2_URL]);
      expect(listing.meetings.map((meeting) => meeting.sourceMeetingId)).toEqual([...PAGE_1_IDS, ...PAGE_2_IDS]);
      expect(listing.complete).toBe(true);
      expect(listing.pagesRead).toBe(2);
    });

    it('keeps page 1 and is not complete when page 2 fails', async () => {
      stubTwoPages('fail');

      const listing = await real.fetchMeetings('salemma', 2);

      expect(listing.meetings.map((meeting) => meeting.sourceMeetingId)).toEqual(PAGE_1_IDS);
      expect(listing.complete).toBe(false);
      expect(listing.pagesRead).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('CivicClerk listing stopped after 1 pages'));
    });

    it('keeps page 1 and is not complete when page 2 times out', async () => {
      stubTwoPages();
      // Page 1 gets a signal that never fires; page 2's has already timed out.
      const timeout = vi
        .spyOn(AbortSignal, 'timeout')
        .mockImplementationOnce(() => new AbortController().signal)
        .mockImplementationOnce(() =>
          AbortSignal.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
        );

      const listing = await real.fetchMeetings('salemma', 2);

      expect(timeout).toHaveBeenCalledTimes(2);
      expect(timeout).toHaveBeenCalledWith(15_000);
      expect(listing.meetings.map((meeting) => meeting.sourceMeetingId)).toEqual(PAGE_1_IDS);
      expect(listing.complete).toBe(false);
      expect(listing.pagesRead).toBe(1);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('aborted due to timeout'));
    });

    it('stops the meeting pass at the bound with pages left, not complete, and reads no page past it', async () => {
      const fetchMock = stubTwoPages();

      const listing = await real.fetchMeetings('salemma', 1);

      expect(requestedUrls(fetchMock)).toEqual([PAGE_1_URL]);
      expect(listing.meetings.map((meeting) => meeting.sourceMeetingId)).toEqual(PAGE_1_IDS);
      expect(listing.complete).toBe(false);
      expect(listing.pagesRead).toBe(1);
    });

    it('lists files from both pages and is complete only after page 2 is read', async () => {
      const fetchMock = stubTwoPages();

      const listing = await real.fetchMeetingFiles('salemma', 2);

      expect(requestedUrls(fetchMock)).toEqual([PAGE_1_URL, PAGE_2_URL]);
      expect([...listing.filesByMeeting.keys()]).toEqual([...PAGE_1_IDS, ...PAGE_2_IDS]);
      expect(listing.complete).toBe(true);
      expect(listing.pagesRead).toBe(2);
    });

    it('stops the file pass at the bound with pages left, not complete, and reads no page past it', async () => {
      const fetchMock = stubTwoPages();

      const listing = await real.fetchMeetingFiles('salemma', 1);

      expect(requestedUrls(fetchMock)).toEqual([PAGE_1_URL]);
      expect([...listing.filesByMeeting.keys()]).toEqual(PAGE_1_IDS);
      expect(listing.complete).toBe(false);
      expect(listing.pagesRead).toBe(1);
    });
  });

  describe('retrieval route', () => {
    type Row = Record<string, unknown>;

    // Fake Supabase client: one town, no governing bodies, and meetings rows
    // keyed by town_id and source_meeting_id, like the table's unique key.
    function createFakeSupabase() {
      const meetings = new Map<string, Row>();
      let nextMeetingId = 501;

      const client = {
        // The caller is a signed-in system administrator.
        auth: { getUser: async () => ({ data: { user: { id: 'admin-user' } }, error: null }) },
        from(table: string) {
          if (table === 'user_accounts') {
            return {
              select: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: { account_role: 'System administrator' }, error: null }) }),
              }),
            };
          }

          if (table === 'towns') {
            return {
              select: () => ({
                eq: () => ({
                  is: () => ({
                    maybeSingle: async () => ({
                      data: { town_id: SALEM_TOWN_ID, source_account_id: 'salemma', meeting_time_zone: 'America/New_York' },
                      error: null,
                    }),
                  }),
                }),
              }),
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

          // The run's check row (SRS-222.1), opened and closed without assertions here.
          if (table === 'source_checks') {
            return {
              insert: () => ({
                select: () => ({
                  single: async () => ({ data: { check_id: 1, started_at: new Date().toISOString() }, error: null }),
                }),
              }),
              update: () => ({ eq: async () => ({ data: null, error: null }) }),
            };
          }

          throw new Error(`Unexpected table: ${table}`);
        },
      };

      return { client, meetings };
    }

    // What the real client returns for the two stub pages, read once per call
    // so the mocks hand the route the same shapes. Files are left out (each
    // meeting lists none), so the run stores no documents.
    async function listTwoPages(
      maxPages: number,
      page2: 'ok' | 'fail' = 'ok',
    ): Promise<{ meetingListing: MeetingListing; fileListing: MeetingFilesListing }> {
      stubTwoPages(page2);
      const meetingListing = await real.fetchMeetings('salemma', maxPages);
      const fileListing = await real.fetchMeetingFiles('salemma', maxPages);
      vi.unstubAllGlobals();

      for (const sourceMeetingId of fileListing.filesByMeeting.keys()) {
        fileListing.filesByMeeting.set(sourceMeetingId, []);
      }
      return { meetingListing, fileListing };
    }

    function mockListings(meetingListing: MeetingListing, fileListing: MeetingFilesListing) {
      vi.mocked(fetchMeetings).mockResolvedValueOnce(meetingListing);
      vi.mocked(fetchMeetingFiles).mockResolvedValueOnce(fileListing);
    }

    function runRetrieval() {
      return POST(
        new Request('http://localhost/api/retrieval/meetings', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer admin-token' },
          body: JSON.stringify({ townId: SALEM_TOWN_ID }),
        }),
      );
    }

    let fake: ReturnType<typeof createFakeSupabase>;

    beforeEach(() => {
      vi.clearAllMocks();
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
      vi.stubEnv('ANTHROPIC_API_KEY', '');
      vi.stubEnv('SUMMARY_MODEL', '');
      vi.stubEnv('RETRIEVAL_MAX_PAGES', '2');
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});

      fake = createFakeSupabase();
      vi.mocked(getSupabaseClient).mockReturnValue(fake.client as unknown as ReturnType<typeof getSupabaseClient>);
    });

    function storedIds(): string[] {
      return [...fake.meetings.values()].map((row) => row.source_meeting_id as string);
    }

    it('stores meetings from both pages and returns complete true', async () => {
      const { meetingListing, fileListing } = await listTwoPages(2);
      mockListings(meetingListing, fileListing);

      const response = await runRetrieval();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ saved: 15, complete: true });
      expect(storedIds()).toEqual([...PAGE_1_IDS, ...PAGE_2_IDS]);
      expect(fetchMeetings).toHaveBeenCalledWith('salemma', 2);
      expect(fetchMeetingFiles).toHaveBeenCalledWith('salemma', 2);
      expect(console.log).toHaveBeenCalledWith(
        'Meeting retrieval: town 1 read 2 meeting pages and 2 file pages, bound 2, complete true',
      );
    });

    it("still stores page 1's meetings and returns complete false when page 2 fails", async () => {
      const { meetingListing, fileListing } = await listTwoPages(2, 'fail');
      mockListings(meetingListing, fileListing);

      const response = await runRetrieval();

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ saved: PAGE_1_SIZE, complete: false });
      expect(storedIds()).toEqual(PAGE_1_IDS);
      expect(console.log).toHaveBeenCalledWith(
        'Meeting retrieval: town 1 read 1 meeting pages and 1 file pages, bound 2, complete false',
      );
    });

    it.each(['meeting', 'file'] as const)(
      'returns complete false when the %s pass hits the bound with pages left',
      async (pass) => {
        vi.stubEnv('RETRIEVAL_MAX_PAGES', '1');
        const bounded = await listTwoPages(1);
        const full = await listTwoPages(2);
        mockListings(
          pass === 'meeting' ? bounded.meetingListing : full.meetingListing,
          pass === 'file' ? bounded.fileListing : full.fileListing,
        );

        const response = await runRetrieval();

        expect(response.status).toBe(200);
        expect((await response.json()).complete).toBe(false);
        expect(fetchMeetings).toHaveBeenCalledWith('salemma', 1);
        expect(fetchMeetingFiles).toHaveBeenCalledWith('salemma', 1);
      },
    );
  });
});
