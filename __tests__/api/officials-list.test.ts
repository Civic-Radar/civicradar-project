// Tests for SRS-311.1, AO, View shared officials list.
// "The system shall display a single shared list of officials extracted from
//  documents for the pilot municipality."
//
// Acceptance:
//   * Each official appears once in the list.
//   * Each entry shows name, title, role, and available contact information.
//   * Details that aren't available are labeled as unavailable (consistent with UR-308).
//   * Each entry links to at least one source document (consistent with UR-303).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOT_FOUND_LABEL } from '../../lib/extractions';

type Row = Record<string, unknown>;
let officialRows: Row[] = [];
const selected: string[] = [];

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (token: string) =>
        token === 'valid-token'
          ? { data: { user: { id: 'user-1' } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
      ),
    },
    from: vi.fn((table: string) => {
      const query = {
        select: vi.fn((columns: string) => { selected.push(`${table}: ${columns}`); return query; }),
        order: vi.fn(async () => ({ data: officialRows, error: null })),
      };
      return query;
    }),
  })),
}));

import { GET } from '../../app/api/officials/route';

function list(token: string | null = 'valid-token') {
  return GET(new Request('http://localhost/api/officials', { headers: token ? { authorization: `Bearer ${token}` } : {} }));
}

const OCT_19 = { document_id: 13, title: 'Joint Public Hearing with the Planning Board Monday October 19, 2026' };
const OCT_15 = { document_id: 19, title: 'Salem City Council Special Meeting October 15, 2026' };

beforeEach(() => {
  selected.length = 0;
  officialRows = [
    {
      official_id: 1, full_name: 'Maureen Elizabeth Fisher', title: 'Acting City Clerk', role: 'Clerk of the meeting',
      email: 'mfisher@salem.com', phone: '978-619-5614', body: { name: 'City Council' },
      sources: [{ document: OCT_15 }, { document: OCT_19 }],
    },
    {
      official_id: 2, full_name: 'Merkl', title: 'Council President', role: 'Presiding',
      email: null, phone: null, body: { name: 'City Council' }, sources: [{ document: OCT_15 }],
    },
  ];
});

describe('GET /api/officials (SRS-311.1)', () => {
  it('requires a signed-in user', async () => {
    expect((await list(null)).status).toBe(401);
    expect((await list('bad-token')).status).toBe(401);
  });

  it('reads the shared officials list with each official\'s body and source documents', async () => {
    await list();
    expect(selected[0]).toMatch(/^officials: .*full_name, title, role, email, phone/);
    expect(selected[0]).toContain('governing_bodies(name)');
    expect(selected[0]).toContain('official_sources(document:documents(document_id, title))');
  });

  it('lists each official once', async () => {
    const { officials } = await (await list()).json();
    expect(officials.map((o: Row) => o.official_id)).toEqual([1, 2]);
  });

  it('shows name, title, role, and available contact information', async () => {
    const { officials } = await (await list()).json();
    expect(officials[0]).toMatchObject({
      full_name: 'Maureen Elizabeth Fisher', title: 'Acting City Clerk', role: 'Clerk of the meeting',
      email: 'mfisher@salem.com', phone: '978-619-5614', body_name: 'City Council',
    });
  });

  it('returns unavailable details as empty, which the page labels "Not found"', async () => {
    const { officials } = await (await list()).json();
    expect(officials[1].email).toBeNull();
    expect(officials[1].phone).toBeNull();
    expect(NOT_FOUND_LABEL).toBe('Not found');
  });

  it('links each entry to every source document, oldest first', async () => {
    const { officials } = await (await list()).json();
    expect(officials[0].sources).toEqual([OCT_19, OCT_15]);
    expect(officials[1].sources).toEqual([OCT_15]);
    for (const official of officials) expect(official.sources.length).toBeGreaterThanOrEqual(1);
  });
});
