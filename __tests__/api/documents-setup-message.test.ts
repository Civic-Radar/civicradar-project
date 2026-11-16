import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentListEntry, DocumentsState } from '../../app/(app)/documents/useDocuments';

// SRS-201.3, MS, Setup message: a signed-in user who follows zero towns sees
// "Follow at least one town to see documents here." and no list entries
// (defects #497 and #499).

type Row = Record<string, string | number | null>;

const db = vi.hoisted(() => ({
  follows: [] as Row[],
  documents: [] as Row[],
  towns: [] as Row[],
  meetings: [] as Row[],
  tablesRead: [] as string[],
}));

// A small stand-in for the four tables GET /api/documents reads.
vi.mock('../../lib/supabase', () => {
  function from(table: string) {
    db.tablesRead.push(table);
    const source: Row[] = ({ user_followed_towns: db.follows, documents: db.documents, towns: db.towns, meetings: db.meetings } as Record<string, Row[]>)[table];
    if (!source) throw new Error(`No table ${table}`);
    let columns: string[] = [];
    const filters: ((row: Row) => boolean)[] = [];
    const builder = {
      select(list: string) { columns = list.split(',').map((name) => name.trim()); return builder; },
      eq(column: string, value: unknown) { filters.push((row) => row[column] === value); return builder; },
      in(column: string, values: unknown[]) { filters.push((row) => values.includes(row[column])); return builder; },
      order() { return builder; },
      then(resolve: (value: { data: Row[]; error: null }) => unknown) {
        const rows = source.filter((row) => filters.every((keep) => keep(row)));
        return Promise.resolve({
          data: rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null]))),
          error: null,
        }).then(resolve);
      },
    };
    return builder;
  }
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'resident@example.com' } }, error: null }) },
    from,
  };
  return { getSupabaseClient: () => client };
});

const hook = vi.hoisted(() => ({ state: { status: 'loading' } as DocumentsState }));
vi.mock('../../app/(app)/documents/useDocuments', () => ({ useDocuments: () => hook.state }));

import { GET } from '../../app/api/documents/route';
// This file is not about the upcoming and past lists (SRS-209.4), so every document is
// treated as upcoming, in the order the page passes it.
vi.mock('../../lib/meetingTimeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/meetingTimeline')>();
  return { ...actual, splitByMeetingDate: <T>(documents: T[]) => ({ upcoming: documents, past: [] as T[] }) };
});

import DocumentsPage from '../../app/(app)/documents/page';
import { SETUP_MESSAGE } from '../../app/(app)/documents/documentsMessages';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

// 8 documents retrieved across two towns, as in the SRS-201.3 example.
function storeEightDocuments() {
  db.towns.push({ town_id: 1, name: 'Salem', meeting_time_zone: 'America/New_York' }, { town_id: 2, name: 'Brookline', meeting_time_zone: 'America/New_York' });
  for (let id = 1; id <= 8; id += 1) {
    db.documents.push({
      document_id: id, meeting_id: 100 + id, town_id: id <= 5 ? 1 : 2, title: `Document ${id}`,
      retrieved_at: `2026-09-0${id}T12:00:00+00:00`, summary_status: 'Complete', document_type: 'Agenda',
    });
    db.meetings.push({ meeting_id: 100 + id, start_at: `2026-09-0${id}T23:00:00+00:00` });
  }
}

async function list() {
  const response = await GET(new Request('http://localhost/api/documents', { headers: { Authorization: 'Bearer token' } }));
  return { status: response.status, body: await response.json() };
}

function entry(id: number): DocumentListEntry {
  return {
    document_id: id, title: `Document ${id}`, town_id: 1, meeting_id: 100 + id, retrieved_at: '2026-09-01T12:00:00+00:00',
    summary_status: 'Complete', document_type: 'Agenda', town_name: 'Salem', meeting_start_at: '2026-09-01T23:00:00+00:00',
    meeting_time_zone: 'America/New_York',
  };
}

function render(state: DocumentsState): string {
  vi.stubGlobal('React', React);
  hook.state = state;
  return renderToStaticMarkup(React.createElement(DocumentsPage));
}

const textOf = (markup: string) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  for (const rows of [db.follows, db.documents, db.towns, db.meetings, db.tablesRead]) rows.length = 0;
  storeEightDocuments();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('GET /api/documents: follows_towns (SRS-201.3)', () => {
  it('returns follows_towns false and no documents for a user who follows no towns, with 8 documents stored', async () => {
    const { status, body } = await list();

    expect(status).toBe(200);
    expect(body).toEqual({ documents: [], follows_towns: false });
    expect(db.tablesRead).toEqual(['user_followed_towns']);
  });

  it('returns follows_towns true for a user who follows one town', async () => {
    db.follows.push({ user_id: 'user-1', town_id: 2 });

    const { body } = await list();

    expect(body.follows_towns).toBe(true);
    // Only the followed town's documents (6, 7 and 8 are Town B's); the order is not what this test is about.
    expect(body.documents.map((row: { document_id: number }) => row.document_id).sort()).toEqual([6, 7, 8]);
  });
});

describe('Documents page: setup message (SRS-201.3)', () => {
  it('has the exact SRS text', () => {
    expect(SETUP_MESSAGE).toBe('Follow at least one town to see documents here.');
  });

  it('shows the setup message and no list entries for a user who follows zero towns', () => {
    const markup = render({ status: 'loaded', documents: [], followsTowns: false });

    expect(textOf(markup)).toContain(SETUP_MESSAGE);
    expect(markup).not.toMatch(/<li\b/);
    expect(markup).not.toMatch(/<ul\b/);
  });

  it('shows no type filter and no count with the setup message', () => {
    const markup = render({ status: 'loaded', documents: [], followsTowns: false });

    expect(markup).not.toMatch(/<select\b/);
    expect(textOf(markup)).not.toMatch(/\b0 documents\b/);
  });

  it('does not show the setup message to a user who follows a town', () => {
    const markup = render({ status: 'loaded', documents: [entry(1), entry(2)], followsTowns: true });

    expect(textOf(markup)).not.toContain(SETUP_MESSAGE);
    expect(Array.from(markup.matchAll(/<li\b/g))).toHaveLength(2);
  });

  it.each([
    ['loading', { status: 'loading' } as DocumentsState],
    ['signed out', { status: 'signedOut' } as DocumentsState],
    ['load failed', { status: 'loadFailed' } as DocumentsState],
  ])('does not show the setup message while %s', (_label, state) => {
    expect(textOf(render(state))).not.toContain(SETUP_MESSAGE);
  });
});
