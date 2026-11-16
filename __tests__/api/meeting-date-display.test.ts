import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentListEntry, DocumentsState } from '../../app/(app)/documents/useDocuments';

// SRS-202.2, MS, Meeting date display: each list entry shows its meeting date
// as MM/DD/YYYY, in the town's time zone, so it does not change with the
// viewer's time zone (defect #515).

type Row = Record<string, string | number | null>;

const db = vi.hoisted(() => ({
  follows: [] as Row[],
  documents: [] as Row[],
  towns: [] as Row[],
  meetings: [] as Row[],
}));

// A small stand-in for the four tables GET /api/documents reads: select with
// projection, eq, in and order, nothing else.
vi.mock('../../lib/supabase', () => {
  function from(table: string) {
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
import { DATE_NOT_AVAILABLE, meetingDateLabel } from '../../lib/documentDates';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

// September 14, 2026 at 7:00 PM in Massachusetts (EDT, UTC-4) is 23:00 UTC.
const SEPT_14_7PM_EASTERN = '2026-09-14T23:00:00+00:00';
const EASTERN = 'America/New_York';

const originalTz = process.env.TZ;

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  db.follows.splice(0, db.follows.length, { user_id: 'user-1', town_id: 1 }, { user_id: 'user-1', town_id: 2 });
  db.towns.splice(0, db.towns.length, { town_id: 1, name: 'Salem', meeting_time_zone: EASTERN }, { town_id: 2, name: 'No zone', meeting_time_zone: null });
  db.documents.splice(
    0,
    db.documents.length,
    { document_id: 1, meeting_id: 11, town_id: 1, title: 'Salem agenda', retrieved_at: '2026-09-10T12:00:00+00:00', summary_status: 'Complete', document_type: 'Agenda' },
    { document_id: 2, meeting_id: 12, town_id: 2, title: 'Other agenda', retrieved_at: '2026-09-09T12:00:00+00:00', summary_status: 'Complete', document_type: 'Agenda' },
  );
  db.meetings.splice(0, db.meetings.length, { meeting_id: 11, start_at: SEPT_14_7PM_EASTERN }, { meeting_id: 12, start_at: SEPT_14_7PM_EASTERN });
});

afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('meetingDateLabel (SRS-202.2)', () => {
  it('shows a meeting held September 14, 2026 as 09/14/2026', () => {
    expect(meetingDateLabel(SEPT_14_7PM_EASTERN, EASTERN)).toBe('09/14/2026');
  });

  it('keeps the date for a viewer in a later time zone, where it is already September 15', () => {
    process.env.TZ = 'Asia/Tokyo';
    // The viewer's own clock is on the 15th, which is what the old list showed.
    expect(new Date(SEPT_14_7PM_EASTERN).getDate()).toBe(15);
    expect(meetingDateLabel(SEPT_14_7PM_EASTERN, EASTERN)).toBe('09/14/2026');
  });

  it('keeps the date for a viewer in an earlier time zone', () => {
    process.env.TZ = 'Pacific/Honolulu';
    // Just after midnight Eastern is still the evening before in Honolulu.
    expect(meetingDateLabel('2026-09-15T04:30:00+00:00', EASTERN)).toBe('09/15/2026');
  });

  it('uses the town zone it is given', () => {
    expect(meetingDateLabel(SEPT_14_7PM_EASTERN, 'Europe/Paris')).toBe('09/15/2026');
  });

  it('falls back to Eastern time when the zone is missing or not a real zone', () => {
    process.env.TZ = 'Asia/Tokyo';
    expect(meetingDateLabel(SEPT_14_7PM_EASTERN, null)).toBe('09/14/2026');
    expect(meetingDateLabel(SEPT_14_7PM_EASTERN, 'Not/A_Zone')).toBe('09/14/2026');
  });

  it('shows Date not available with no start time or an unreadable one (SRS-202.3)', () => {
    expect(meetingDateLabel(null, EASTERN)).toBe(DATE_NOT_AVAILABLE);
    expect(meetingDateLabel('not a date', EASTERN)).toBe(DATE_NOT_AVAILABLE);
    expect(DATE_NOT_AVAILABLE).toBe('Date not available');
  });
});

describe('GET /api/documents: meeting_time_zone on each entry (SRS-202.2)', () => {
  it("returns each entry's town time zone, and null for a town with none", async () => {
    const response = await GET(new Request('http://localhost/api/documents', { headers: { Authorization: 'Bearer token' } }));
    expect(response.status).toBe(200);
    const { documents } = await response.json();

    expect(documents.map((row: DocumentListEntry) => [row.document_id, row.meeting_time_zone])).toEqual([
      [1, EASTERN],
      [2, null],
    ]);
  });
});

describe('Documents page: meeting date on each entry (SRS-202.2)', () => {
  function entry(overrides: Partial<DocumentListEntry>): DocumentListEntry {
    return {
      document_id: 1,
      title: 'Salem agenda',
      town_id: 1,
      meeting_id: 11,
      retrieved_at: '2026-09-10T12:00:00+00:00',
      summary_status: 'Complete',
      document_type: 'Agenda',
      town_name: 'Salem',
      meeting_start_at: SEPT_14_7PM_EASTERN,
      meeting_time_zone: EASTERN,
      ...overrides,
    };
  }

  function render(documents: DocumentListEntry[]): string {
    vi.stubGlobal('React', React);
    hook.state = { status: 'loaded', documents, followsTowns: true };
    return renderToStaticMarkup(React.createElement(DocumentsPage)).replace(/<[^>]*>/g, ' ');
  }

  it('shows 09/14/2026 on the entry for a viewer whose clock is already on September 15', () => {
    process.env.TZ = 'Asia/Tokyo';
    const text = render([entry({})]);
    expect(text).toContain('09/14/2026');
    expect(text).not.toContain('09/15/2026');
  });

  it('still shows Date not available for an entry with no meeting start', () => {
    expect(render([entry({ meeting_start_at: null })])).toContain('Date not available');
  });
});
