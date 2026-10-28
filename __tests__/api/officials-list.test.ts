// Tests for SRS-311.1, AO, View officials list.
// "The system shall display the officials found by the signed-in user's saved
//  extractions who have an email address or telephone number, each listed once
//  with the documents they were found in."
//
// Acceptance:
//   * Each official appears once, even when several of the user's extractions found them.
//   * Each entry shows name, title, role, email address, and telephone number, with the most recent details found.
//   * Only officials with an email address or telephone number are listed.
//   * Details that aren't available are labeled as unavailable (consistent with UR-308).
//   * Each entry links to every source document it was found in (consistent with UR-303).
//   * Officials from another user's extractions are not listed.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildOfficialsList, groupByTown, type ExtractionWithOfficials, type MyOfficial } from '../../lib/officialsList';

type Row = Record<string, unknown>;
let extractionRows: (ExtractionWithOfficials & { user_id: string; status: string })[] = [];
const filters: [string, unknown][] = [];

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (token: string) =>
        token === 'valid-token'
          ? { data: { user: { id: 'user-a' } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
      ),
    },
    from: vi.fn((table: string) => {
      if (table === 'towns') {
        const towns = [{ town_id: 1, name: 'Salem' }, { town_id: 10, name: 'Brookline' }];
        const q = { select: vi.fn(() => q), in: vi.fn(async (_c: string, ids: number[]) => ({ data: towns.filter((t) => ids.includes(t.town_id)), error: null })) };
        return q;
      }
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((column: string, value: unknown) => { filters.push([column, value]); return query; }),
        order: vi.fn(async () => ({
          data: extractionRows.filter((r) => filters.every(([c, v]) => (r as unknown as Row)[c] === v)),
          error: null,
        })),
      };
      return query;
    }),
  })),
}));

import { GET } from '../../app/api/officials/route';

const list = async (token: string | null = 'valid-token') => {
  const res = await GET(new Request('http://localhost/api/officials', { headers: token ? { authorization: `Bearer ${token}` } : {} }));
  return { status: res.status, body: await res.json() };
};

const OCT_19 = { id: 13, title: 'Joint Public Hearing with the Planning Board Monday October 19, 2026' };
const OCT_15 = { id: 18, title: 'Salem City Council Special Meeting October 15, 2026' };

function extraction(id: number, doc: { id: number; title: string }, completedAt: string, officials: Row[], userId = 'user-a', townId = 1) {
  return {
    extraction_id: id, user_id: userId, status: 'Completed', completed_at: completedAt,
    document_id: doc.id, source_document_title: doc.title, document: { town_id: townId },
    officials: officials as ExtractionWithOfficials['officials'],
  };
}
const person = (full_name: string, details: Row = {}) => ({ full_name, title: null, role: null, email: null, phone: null, ...details });

beforeEach(() => {
  filters.length = 0;
  extractionRows = [
    extraction(32, OCT_19, '2026-10-23T02:36:50Z', [
      person('Maureen Elizabeth Fisher', { title: 'City Clerk' }),
      person('Alice Merkl', { title: 'Councillor', role: 'Presiding' }),
    ]),
    extraction(33, OCT_15, '2026-10-24T15:00:00Z', [
      person('maureen elizabeth  fisher', { title: 'Acting City Clerk', email: 'mfisher@salem.com', phone: '978-745-9595 ext. 41200' }),
    ]),
    extraction(40, OCT_15, '2026-10-24T16:00:00Z', [person('Someone Else', { email: 'else@salem.com' })], 'user-b'),
  ];
});

describe('GET /api/officials (SRS-311.1)', () => {
  it('requires a signed-in user', async () => {
    expect((await list(null)).status).toBe(401);
    expect((await list('bad-token')).status).toBe(401);
  });

  it("reads only the signed-in user's completed extractions", async () => {
    await list();
    expect(filters).toContainEqual(['user_id', 'user-a']);
    expect(filters).toContainEqual(['status', 'Completed']);
  });

  it('lists each official once, with the most recent details found', async () => {
    const { body } = await list();
    const fishers = body.officials.filter((o: Row) => /fisher/i.test(String(o.full_name)));
    expect(fishers).toHaveLength(1);
    expect(fishers[0]).toMatchObject({ title: 'Acting City Clerk', email: 'mfisher@salem.com', phone: '978-745-9595 ext. 41200' });
  });

  it('lists only officials with an email address or telephone number', async () => {
    const { body } = await list();
    expect(body.officials.map((o: Row) => o.full_name)).toEqual(['Maureen Elizabeth Fisher']);
  });

  it('links each entry to every document it was found in', async () => {
    const { body } = await list();
    expect(body.officials[0].sources).toEqual([
      { extraction_id: 32, document_id: 13, title: OCT_19.title },
      { extraction_id: 33, document_id: 18, title: OCT_15.title },
    ]);
  });

  it("does not list officials from another user's extractions", async () => {
    const { body } = await list();
    expect(body.officials.some((o: Row) => o.full_name === 'Someone Else')).toBe(false);
  });

  it('is empty when the user has no saved extractions', async () => {
    extractionRows = [];
    expect((await list()).body.officials).toEqual([]);
  });
});

describe('buildOfficialsList (SRS-311.1)', () => {
  it('never blanks a detail that a later extraction did not find', () => {
    const officials = buildOfficialsList([
      extraction(1, OCT_15, '2026-10-24T15:00:00Z', [person('Maureen Elizabeth Fisher', { email: 'mfisher@salem.com', phone: '978-745-9595' })]),
      extraction(2, OCT_19, '2026-10-25T15:00:00Z', [person('Maureen Elizabeth Fisher', { title: 'City Clerk' })]),
    ]);
    expect(officials[0]).toMatchObject({ title: 'City Clerk', email: 'mfisher@salem.com', phone: '978-745-9595' });
  });

  it('keeps unavailable details empty, which the page labels "Not found"', () => {
    const [official] = buildOfficialsList([extraction(1, OCT_15, '2026-10-24T15:00:00Z', [person('Kristen Sacco', { phone: '978-555-0100' })])]);
    expect(official.email).toBeNull();
    expect(official.title).toBeNull();
  });

  it('lists a document once even if the user extracted it twice', () => {
    const [official] = buildOfficialsList([
      extraction(1, OCT_15, '2026-10-24T15:00:00Z', [person('Kristen Sacco', { phone: '978-555-0100' })]),
      extraction(2, OCT_15, '2026-10-25T15:00:00Z', [person('Kristen Sacco', { phone: '978-555-0100' })]),
    ]);
    expect(official.sources).toHaveLength(1);
  });
});

describe('Officials split by city (Task 311.1-8)', () => {
  const BROOKLINE_DOC = { id: 140, title: 'Agenda 10.22.2026 - 1' };

  it("gives each official their city's name", async () => {
    extractionRows.push(
      extraction(50, BROOKLINE_DOC, '2026-10-25T15:00:00Z', [person('Polly Selkoe', { title: 'Regulatory Planning Director', email: 'pselkoe@brooklinema.gov' })], 'user-a', 10),
    );

    const { body } = await list();

    expect(body.officials.map((o: Row) => [o.full_name, o.town_name])).toEqual([
      ['Maureen Elizabeth Fisher', 'Salem'],
      ['Polly Selkoe', 'Brookline'],
    ]);
  });

  it('keeps the same name in two cities as two people', () => {
    const officials = buildOfficialsList([
      extraction(1, OCT_15, '2026-10-24T15:00:00Z', [person('Jane Doe', { email: 'jdoe@salem.com' })]),
      extraction(2, BROOKLINE_DOC, '2026-10-25T15:00:00Z', [person('Jane Doe', { email: 'jdoe@brooklinema.gov' })], 'user-a', 10),
    ]);
    expect(officials).toHaveLength(2);
  });

  it('groups the list by city, cities in alphabetical order, unknown town last', () => {
    const official = (name: string, town_id: number | null, town_name?: string): MyOfficial => ({
      key: name, town_id, town_name, full_name: name, title: null, role: null, email: 'x@example.com', phone: null, sources: [],
    });
    const groups = groupByTown([
      official('A', 1, 'Salem'), official('B', null), official('C', 10, 'Brookline'), official('D', 1, 'Salem'),
    ]);
    expect(groups.map((g) => [g.town_name, g.officials.map((o) => o.full_name)])).toEqual([
      ['Brookline', ['C']],
      ['Salem', ['A', 'D']],
      ['Other', ['B']],
    ]);
  });
});
