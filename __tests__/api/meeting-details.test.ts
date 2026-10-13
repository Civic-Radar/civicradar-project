import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type StoredRow = Record<string, unknown>;

const STORED_MEETING: StoredRow = {
  meeting_id: 42,
  town_id: 1,
  body_id: 7,
  title: 'City Council Regular Meeting',
  source_body_name: 'General',
  source_start_time: '2026-09-24T19:00:00Z',
  start_at: '2026-09-24T23:00:00.000Z',
  location: null,
  online_link: null,
  source_url: 'https://example.portal.civicclerk.com/event/1192/overview',
};

// Fake Supabase client. Each table holds rows keyed by its id column;
// eq() picks the row and maybeSingle() returns it or null.
function createFakeSupabase() {
  const tables: Record<string, { idColumn: string; rows: StoredRow[] }> = {
    meetings: { idColumn: 'meeting_id', rows: [STORED_MEETING] },
    towns: { idColumn: 'town_id', rows: [{ town_id: 1, name: 'Salem', meeting_time_zone: 'America/New_York' }] },
    governing_bodies: { idColumn: 'body_id', rows: [{ body_id: 7, name: 'City Council' }] },
  };

  return {
    from(table: string) {
      const stored = tables[table];
      if (!stored) {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        select: () => ({
          eq: (column: string, value: unknown) => {
            expect(column).toBe(stored.idColumn);
            return {
              maybeSingle: async () => ({
                data: stored.rows.find((row) => row[column] === value) ?? null,
                error: null,
              }),
            };
          },
        }),
      };
    },
  };
}

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => createFakeSupabase()),
}));

import { GET } from '../../app/api/meetings/[id]/route';

function getMeeting(id: string) {
  return GET(new Request(`http://localhost/api/meetings/${id}`), { params: { id } });
}

describe('Meeting details API (SRS-502.2)', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns the meeting with its town and governing body names', async () => {
    const response = await getMeeting('42');

    expect(response.status).toBe(200);
    const { meeting } = await response.json();
    expect(meeting).toMatchObject({
      meeting_id: 42,
      title: 'City Council Regular Meeting',
      source_body_name: 'General',
      start_at: '2026-09-24T23:00:00.000Z',
      location: null,
      online_link: null,
      source_url: 'https://example.portal.civicclerk.com/event/1192/overview',
      town_name: 'Salem',
      meeting_time_zone: 'America/New_York',
      body_name: 'City Council',
    });
  });

  it('returns 404 for an unknown meeting id', async () => {
    const response = await getMeeting('999');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Meeting not found.' });
  });

  it('returns 400 for a non-numeric meeting id', async () => {
    for (const id of ['abc', '12abc', '-1', '1.5']) {
      const response = await getMeeting(id);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Invalid meeting id.' });
    }
  });
});
