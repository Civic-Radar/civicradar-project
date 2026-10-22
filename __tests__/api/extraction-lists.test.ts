// Tests for the order of the two lists on the extraction pages (SRS-302.1):
//   GET /api/extractions/documents  documents grouped by meeting, newest meeting first
//   sortByDetailsFound               officials with contact details first
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sortByDetailsFound } from '../../lib/extractions';
import type { ExtractedOfficial } from '../../lib/extractions';

type Row = Record<string, unknown>;

let documentRows: Row[] = [];

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (token: string) =>
        token === 'valid-token'
          ? { data: { user: { id: 'user-123' } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
      ),
    },
    from: vi.fn(() => {
      const query = {
        select: vi.fn(() => query),
        limit: vi.fn(async () => ({ data: documentRows, error: null })),
      };
      return query;
    }),
  })),
}));

import { GET } from '../../app/api/extractions/documents/route';

function documentRow(id: number, type: string, meeting: Row | null): Row {
  return {
    document_id: id,
    title: `${type} ${id}`,
    document_type: type,
    mime_type: 'application/pdf',
    retrieved_at: '2026-10-15T00:36:00Z',
    meeting,
  };
}

const OCT = { meeting_id: 7, title: 'Joint Public Hearing', start_at: '2026-10-19T22:00:00Z' };
const SEP = { meeting_id: 10, title: 'City Council Regular Meeting', start_at: '2026-09-10T23:00:00Z' };
const JAN = { meeting_id: 50, title: 'City Council Regular Meeting', start_at: '2025-01-24T00:00:00Z' };

async function listDocumentIds(token: string | null = 'valid-token') {
  const request = new Request('http://localhost/api/extractions/documents', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  const res = await GET(request);
  return { status: res.status, body: await res.json() };
}

describe('GET /api/extractions/documents', () => {
  beforeEach(() => {
    documentRows = [];
  });

  it('requires a signed-in user', async () => {
    expect((await listDocumentIds(null)).status).toBe(401);
  });

  it('lists the newest meeting first, whatever order the documents were retrieved in', async () => {
    documentRows = [documentRow(1, 'Agenda', JAN), documentRow(2, 'Agenda', OCT), documentRow(3, 'Agenda', SEP)];
    const { status, body } = await listDocumentIds();
    expect(status).toBe(200);
    expect(body.documents.map((d: Row) => d.document_id)).toEqual([2, 3, 1]);
  });

  it('keeps a meeting\'s documents together: agenda, packet, minutes, then other', async () => {
    documentRows = [
      documentRow(1, 'Minutes', SEP),
      documentRow(2, 'Packet', OCT),
      documentRow(3, 'Other', SEP),
      documentRow(4, 'Agenda', SEP),
      documentRow(5, 'Agenda', OCT),
      documentRow(6, 'Packet', SEP),
    ];
    const { body } = await listDocumentIds();
    expect(body.documents.map((d: Row) => d.document_id)).toEqual([5, 2, 4, 6, 1, 3]);
  });

  it('returns each document with its meeting, and puts documents without one last', async () => {
    documentRows = [documentRow(1, 'Agenda', null), documentRow(2, 'Agenda', OCT)];
    const { body } = await listDocumentIds();
    expect(body.documents[0].meeting).toEqual(OCT);
    expect(body.documents[1].document_id).toBe(1);
    expect(body.documents[1].meeting).toBeNull();
  });
});

describe('sortByDetailsFound', () => {
  function official(id: number, details: Partial<ExtractedOfficial>): ExtractedOfficial {
    return { extracted_official_id: id, full_name: `Person ${id}`, title: null, role: null, email: null, phone: null, ...details };
  }

  it('puts officials with an email or phone first, then the ones with the most details', () => {
    const sorted = sortByDetailsFound([
      official(1, { title: 'Councillor' }),
      official(2, { title: 'Councillor', role: 'Presiding' }),
      official(3, { title: 'City Clerk', email: 'clerk@salem.com' }),
      official(4, {}),
    ]);
    expect(sorted.map((o) => o.extracted_official_id)).toEqual([3, 2, 1, 4]);
  });

  it('keeps the original order between officials with the same details', () => {
    const sorted = sortByDetailsFound([official(1, { title: 'A' }), official(2, { title: 'B' }), official(3, { title: 'C' })]);
    expect(sorted.map((o) => o.extracted_official_id)).toEqual([1, 2, 3]);
  });
});
