// Tests for SRS-301.8, AO, Extractable documents.
// "The system shall list on the extraction page only documents from the user's
//  followed towns whose meeting has already taken place."
//
// Acceptance: Given a user follows Salem but not Brookline, and Salem has documents
// for a meeting that has taken place and for one that has not, When the user opens
// the extraction page, Then only the documents for the Salem meeting that has taken
// place are listed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasMeetingTakenPlace } from '../../lib/extractions';

const SALEM = 1;
const BROOKLINE = 10;
type Row = Record<string, unknown>;
let follows: Row[] = [];
let documentRows: Row[] = [];
let townFilter: unknown[] | null = null;

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-a' } }, error: null })) },
    from: vi.fn((table: string) => {
      if (table === 'user_followed_towns') {
        const q = { select: vi.fn(() => q), eq: vi.fn(async () => ({ data: follows, error: null })) };
        return q;
      }
      const q = {
        select: vi.fn(() => q),
        in: vi.fn((_column: string, ids: unknown[]) => { townFilter = ids; return q; }),
        limit: vi.fn(async () => ({ data: documentRows.filter((d) => townFilter?.includes(d.town_id)), error: null })),
      };
      return q;
    }),
  })),
}));

import { GET } from '../../app/api/extractions/documents/route';

const NOW = new Date('2026-10-27T18:00:00Z');
const PAST_SALEM = { meeting_id: 7, title: 'Joint Public Hearing with the Planning Board', start_at: '2026-10-19T22:00:00Z' };
const FUTURE_SALEM = { meeting_id: 60, title: 'City Council Regular Meeting', start_at: '2026-11-12T23:00:00Z' };
const PAST_BROOKLINE = { meeting_id: 80, title: 'Select Board Meeting', start_at: '2026-10-20T23:00:00Z' };

function doc(id: number, townId: number, meeting: Row | null): Row {
  return { document_id: id, town_id: townId, title: `Document ${id}`, document_type: 'Agenda', mime_type: 'application/pdf', retrieved_at: '2026-10-25T00:00:00Z', meeting };
}

async function list() {
  const res = await GET(new Request('http://localhost/api/extractions/documents', { headers: { authorization: 'Bearer t' } }));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  townFilter = null;
  follows = [{ town_id: SALEM }];
  documentRows = [doc(1, SALEM, PAST_SALEM), doc(2, SALEM, FUTURE_SALEM), doc(3, BROOKLINE, PAST_BROOKLINE)];
});
afterEach(() => vi.useRealTimers());

describe('Extractable documents (SRS-301.8)', () => {
  it('lists only the Salem document for the meeting that has taken place', async () => {
    const { status, body } = await list();

    expect(status).toBe(200);
    expect(body.documents.map((d: Row) => d.document_id)).toEqual([1]);
  });

  it('asks only for the followed towns\' documents', async () => {
    await list();

    expect(townFilter).toEqual([SALEM]);
  });

  it('lists a town once the user follows it', async () => {
    follows = [{ town_id: SALEM }, { town_id: BROOKLINE }];

    const { body } = await list();

    expect(body.documents.map((d: Row) => d.document_id).sort()).toEqual([1, 3]);
  });

  it('lists nothing, and says why, when the user follows no town', async () => {
    follows = [];

    const { body } = await list();

    expect(body).toEqual({ documents: [], followsAnyTown: false });
  });

  it('counts a meeting as taken place once its start time has passed', () => {
    expect(hasMeetingTakenPlace({ meeting: { start_at: '2026-10-27T17:59:00Z' } }, NOW)).toBe(true);
    expect(hasMeetingTakenPlace({ meeting: { start_at: '2026-10-27T18:00:00Z' } }, NOW)).toBe(true);
    expect(hasMeetingTakenPlace({ meeting: { start_at: '2026-10-27T18:01:00Z' } }, NOW)).toBe(false);
    expect(hasMeetingTakenPlace({ meeting: null }, NOW)).toBe(false);
  });
});
