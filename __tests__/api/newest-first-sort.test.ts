import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentListEntry, DocumentsState } from '../../app/(app)/documents/useDocuments';

// SRS-209.1, MS, Newest-first sort: the document list is sorted by meeting
// date, newest first, when the Documents page loads.

type Row = Record<string, string | number | null>;

// A small in-memory stand-in for the four tables GET /api/documents reads.
// It models select (with projection), eq, in and order, and nothing else.
const db = vi.hoisted(() => ({
  follows: [] as Row[],
  documents: [] as Row[],
  towns: [] as Row[],
  meetings: [] as Row[],
}));

vi.mock('../../lib/supabase', () => {
  function from(table: string) {
    const source: Row[] =
      table === 'user_followed_towns' ? db.follows
        : table === 'documents' ? db.documents
          : table === 'towns' ? db.towns
            : table === 'meetings' ? db.meetings
              : (() => { throw new Error(`No table ${table}`); })();
    let columns: string[] = [];
    const filters: ((row: Row) => boolean)[] = [];
    const orders: { column: string; ascending: boolean }[] = [];
    const builder = {
      select(list: string) { columns = list.split(',').map((name) => name.trim()); return builder; },
      eq(column: string, value: unknown) { filters.push((row) => row[column] === value); return builder; },
      in(column: string, values: unknown[]) { filters.push((row) => values.includes(row[column])); return builder; },
      order(column: string, options?: { ascending?: boolean }) {
        orders.push({ column, ascending: options?.ascending ?? true });
        return builder;
      },
      then(resolve: (value: { data: Row[]; error: null }) => unknown) {
        const rows = source.filter((row) => filters.every((keep) => keep(row))).sort((a, b) => {
          for (const { column, ascending } of orders) {
            const x = column === 'retrieved_at' ? Date.parse(String(a[column])) : (a[column] as number);
            const y = column === 'retrieved_at' ? Date.parse(String(b[column])) : (b[column] as number);
            if (x !== y) return (x < y ? -1 : 1) * (ascending ? 1 : -1);
          }
          return 0;
        });
        return Promise.resolve({
          data: rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column]]))),
          error: null,
        }).then(resolve);
      },
    };
    return builder;
  }
  const client = {
    auth: {
      getUser: async (token: string) =>
        token === 'valid-token'
          ? { data: { user: { id: 'user-1', email: 'resident@example.com' } }, error: null }
          : { data: { user: null }, error: { message: 'bad token' } },
    },
    from,
  };
  return { getSupabaseClient: () => client };
});

// The page reads its data only through useDocuments, so the hook is replaced.
const hook = vi.hoisted(() => ({ state: { status: 'loading' } as DocumentsState }));
vi.mock('../../app/(app)/documents/useDocuments', () => ({ useDocuments: () => hook.state }));

import { GET } from '../../app/api/documents/route';
import DocumentsPage from '../../app/(app)/documents/page';
import { newestMeetingFirst } from '../../lib/documentOrder';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

const TOWN = 1;

function storedDocument(id: number, retrievedAt: string): Row {
  return {
    document_id: id,
    meeting_id: 1000 + id,
    town_id: TOWN,
    title: `Document ${id}`,
    retrieved_at: retrievedAt,
    summary_status: 'Complete',
    document_type: 'Agenda',
  };
}

function storedMeeting(documentId: number, startAt: string | null): Row {
  return { meeting_id: 1000 + documentId, town_id: TOWN, start_at: startAt };
}

async function listedIds(): Promise<number[]> {
  const response = await GET(new Request('http://localhost/api/documents', { headers: { Authorization: 'Bearer valid-token' } }));
  expect(response.status).toBe(200);
  const body = await response.json();
  return body.documents.map((row: { document_id: number }) => row.document_id);
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  db.follows.splice(0, db.follows.length, { user_id: 'user-1', town_id: TOWN });
  db.towns.splice(0, db.towns.length, { town_id: TOWN, name: 'Salem', meeting_time_zone: 'America/New_York' });
  db.documents.length = 0;
  db.meetings.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('newestMeetingFirst (SRS-209.1)', () => {
  const at = (id: number, meeting_start_at: string | null) => ({ id, meeting_start_at });

  it('puts the SRS-209.1 example in the order 09/15, 09/08, 09/01', () => {
    const sorted = newestMeetingFirst([
      at(1, '2026-09-01T23:00:00+00:00'),
      at(2, '2026-09-08T23:00:00+00:00'),
      at(3, '2026-09-15T23:00:00+00:00'),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual([3, 2, 1]);
  });

  it('keeps the incoming order for meetings that start at the same time', () => {
    const sorted = newestMeetingFirst([
      at(1, '2026-09-08T23:00:00+00:00'),
      at(2, '2026-09-15T23:00:00+00:00'),
      at(3, '2026-09-08T23:00:00+00:00'),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual([2, 1, 3]);
  });

  it('puts entries with no or an unreadable meeting start after every dated entry, in their incoming order', () => {
    const sorted = newestMeetingFirst([
      at(1, null),
      at(2, '2026-09-01T23:00:00+00:00'),
      at(3, 'not a date'),
      at(4, '2026-09-15T23:00:00+00:00'),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual([4, 2, 1, 3]);
  });

  it('returns a new array and leaves the input as it was', () => {
    const input = [at(1, '2026-09-01T23:00:00+00:00'), at(2, '2026-09-15T23:00:00+00:00')];
    const sorted = newestMeetingFirst(input);
    expect(sorted).not.toBe(input);
    expect(input.map((entry) => entry.id)).toEqual([1, 2]);
  });
});

describe('GET /api/documents: newest-first sort (SRS-209.1)', () => {
  it('returns documents with meeting dates 09/01, 09/08 and 09/15/2026 in the order 09/15, 09/08, 09/01', async () => {
    // Retrieved in the opposite order, so the retrieval time alone would give the wrong order.
    db.documents.push(
      storedDocument(1, '2026-09-20T12:00:00+00:00'),
      storedDocument(2, '2026-09-10T12:00:00+00:00'),
      storedDocument(3, '2026-09-02T12:00:00+00:00'),
    );
    db.meetings.push(
      storedMeeting(1, '2026-09-01T23:00:00+00:00'),
      storedMeeting(2, '2026-09-08T23:00:00+00:00'),
      storedMeeting(3, '2026-09-15T23:00:00+00:00'),
    );

    expect(await listedIds()).toEqual([3, 2, 1]);
  });

  it('keeps documents of the same meeting newest retrieved first, and lists undated documents last', async () => {
    db.documents.push(
      storedDocument(1, '2026-09-20T12:00:00+00:00'),
      storedDocument(2, '2026-09-21T12:00:00+00:00'),
      storedDocument(3, '2026-09-30T12:00:00+00:00'),
      storedDocument(4, '2026-09-01T12:00:00+00:00'),
    );
    // Documents 1 and 2 belong to meetings that start at the same time; 3 has no start time.
    db.meetings.push(
      storedMeeting(1, '2026-09-08T23:00:00+00:00'),
      storedMeeting(2, '2026-09-08T23:00:00+00:00'),
      storedMeeting(3, null),
      storedMeeting(4, '2026-09-15T23:00:00+00:00'),
    );

    expect(await listedIds()).toEqual([4, 2, 1, 3]);
  });

  it('returns the list fields', async () => {
    db.documents.push(storedDocument(1, '2026-09-20T12:00:00+00:00'));
    db.meetings.push(storedMeeting(1, '2026-09-01T23:00:00+00:00'));

    const response = await GET(new Request('http://localhost/api/documents', { headers: { Authorization: 'Bearer valid-token' } }));
    const body = await response.json();

    expect(Object.keys(body.documents[0]).sort()).toEqual([
      'document_id', 'document_type', 'meeting_id', 'meeting_start_at', 'meeting_time_zone', 'retrieved_at', 'summary_status',
      'title', 'town_id', 'town_name',
    ]);
  });
});

describe('Documents page: keeps the API order under Newest first (SRS-209.1)', () => {
  function entry(id: number, meetingStartAt: string): DocumentListEntry {
    return {
      document_id: id,
      title: `Document ${id}`,
      town_id: TOWN,
      meeting_id: 1000 + id,
      retrieved_at: '2026-09-20T12:00:00+00:00',
      summary_status: 'Complete',
      document_type: 'Agenda',
      town_name: 'Salem',
      meeting_start_at: meetingStartAt,
      meeting_time_zone: 'America/New_York',
    };
  }

  it('renders the entries in the order the API returns them, under the Newest first label', () => {
    // Vitest compiles JSX to React.createElement and the page does not import React.
    vi.stubGlobal('React', React);
    hook.state = {
      status: 'loaded',
      documents: [
        entry(3, '2026-09-15T16:00:00+00:00'),
        entry(2, '2026-09-08T16:00:00+00:00'),
        entry(1, '2026-09-01T16:00:00+00:00'),
      ],
    };

    const markup = renderToStaticMarkup(React.createElement(DocumentsPage));
    const titles = Array.from(markup.matchAll(/>Document (\d+)</g), ([, id]) => Number(id));

    expect(titles).toEqual([3, 2, 1]);
    expect(markup).toContain('Newest first');
  });
});
