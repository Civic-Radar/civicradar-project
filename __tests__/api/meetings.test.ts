import { readFileSync } from 'fs';
import { join } from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchMeetings } from '../../lib/sources/civicclerk';
import { saveMeetings, toStartAt, type RetrievalTown } from '../../lib/retrieval/saveMeetings';

// Page 1 of Salem's CivicClerk events, saved unchanged from the API.
const FIXTURE_PATH = join(__dirname, '../fixtures/civicclerk-events-salemma.json');

type FixtureEvent = { id: number; [field: string]: unknown };
type FixturePage = { value: FixtureEvent[]; '@odata.nextLink'?: string };

function readFixture(): FixturePage {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FixturePage;
}

function fixtureEvent(page: FixturePage, id: number): FixtureEvent {
  const event = page.value.find((candidate) => candidate.id === id);
  if (!event) {
    throw new Error(`Fixture is missing event ${id}: ${FIXTURE_PATH}`);
  }
  return event;
}

const SALEM: RetrievalTown = { town_id: 1, meeting_time_zone: 'America/New_York' };

// Serves one page with no next link, so fetchMeetings reads only the sample.
function stubCivicClerk(events: FixtureEvent[]) {
  const page = { ...readFixture(), value: events };
  delete page['@odata.nextLink'];
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(page), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

type StoredRow = Record<string, unknown>;

// Fake Supabase client. meetings rows live in a Map keyed by
// town_id and source_meeting_id, like the table's unique key.
function createFakeSupabase() {
  const stored = new Map<string, StoredRow>();
  const upsertOptions: unknown[] = [];

  const client = {
    from(table: string) {
      if (table === 'governing_bodies') {
        return {
          select: () => ({
            eq: () => ({
              is: async () => ({ data: [{ body_id: 1, name: 'City Council' }], error: null }),
            }),
          }),
        };
      }

      if (table === 'meetings') {
        return {
          upsert: (rows: StoredRow[], options: unknown) => {
            upsertOptions.push(options);
            for (const row of rows) {
              stored.set(`${row.town_id}:${row.source_meeting_id}`, row);
            }
            return {
              select: async () => ({ data: rows.map((_, index) => ({ meeting_id: index + 1 })), error: null }),
            };
          },
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    },
  };

  return { supabase: client as unknown as SupabaseClient, stored, upsertOptions };
}

function storedMeeting(stored: Map<string, StoredRow>, sourceMeetingId: string): StoredRow {
  const row = stored.get(`${SALEM.town_id}:${sourceMeetingId}`);
  if (!row) {
    throw new Error(`Meeting ${sourceMeetingId} was not stored`);
  }
  return row;
}

describe('toStartAt', () => {
  it('treats the source time as New York wall-clock time', () => {
    expect(toStartAt('2026-09-24T19:00:00Z', 'America/New_York')).toBe('2026-09-24T23:00:00.000Z');
    expect(toStartAt('2026-12-10T19:00:00Z', 'America/New_York')).toBe('2026-12-11T00:00:00.000Z');
  });
});

describe('Meeting details storage (SRS-220.3)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores the AC fields for retrieved Salem meetings', async () => {
    const fixture = readFixture();
    fixtureEvent(fixture, 1192);
    fixtureEvent(fixture, 1165);
    const fetchMock = stubCivicClerk(fixture.value);
    const { supabase, stored } = createFakeSupabase();

    const meetings = await fetchMeetings('salemma');
    await saveMeetings(supabase, SALEM, meetings);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const general = storedMeeting(stored, '1192');
    expect(general).toMatchObject({
      town_id: 1,
      title: 'Salem City Council Regular Meeting September 24, 2026',
      source_body_name: 'General',
      source_body_id: '24',
      body_id: null,
      source_start_time: '2026-09-24T19:00:00Z',
      start_at: '2026-09-24T23:00:00.000Z',
      location: '93 Washington Street, Council Chambers, 2nd Floor, Salem, MA 01970',
      source_url: 'https://salemma.portal.civicclerk.com/event/1192/overview',
    });

    const cityCouncil = storedMeeting(stored, '1165');
    expect(cityCouncil.source_body_name).toBe('City Council');
    expect(cityCouncil.body_id).toBe(1);
    expect(cityCouncil.start_at).toBe('2026-12-11T00:00:00.000Z');

    for (const row of stored.values()) {
      expect(row.online_link).toBeNull();
    }
  });

  it('keeps one row per meeting after two saves', async () => {
    const fixture = readFixture();
    stubCivicClerk(fixture.value);
    const { supabase, stored, upsertOptions } = createFakeSupabase();

    const meetings = await fetchMeetings('salemma');
    expect(meetings).toHaveLength(fixture.value.length);

    expect(await saveMeetings(supabase, SALEM, meetings)).toBe(meetings.length);
    expect(stored.size).toBe(meetings.length);

    expect(await saveMeetings(supabase, SALEM, meetings)).toBe(meetings.length);
    expect(stored.size).toBe(meetings.length);

    expect(upsertOptions).toEqual([
      { onConflict: 'town_id,source_meeting_id' },
      { onConflict: 'town_id,source_meeting_id' },
    ]);
  });

  it('stores an omitted title and location as null, never an empty string', async () => {
    const fixture = readFixture();
    // Synthetic event, not from the source: a copy of 1192 with no title and no location.
    const synthetic: FixtureEvent = { ...fixtureEvent(fixture, 1192), id: 900001, eventName: '', eventLocation: null };
    stubCivicClerk([synthetic]);
    const { supabase, stored } = createFakeSupabase();

    await saveMeetings(supabase, SALEM, await fetchMeetings('salemma'));

    const row = storedMeeting(stored, '900001');
    expect(row.title).toBeNull();
    expect(row.location).toBeNull();
    expect(Object.values(row)).not.toContain('');
  });
});
