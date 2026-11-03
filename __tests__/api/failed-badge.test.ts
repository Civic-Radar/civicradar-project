import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentListEntry, DocumentsState } from '../../app/(app)/documents/useDocuments';

// @types/react-dom is not installed, so react-dom/server is loaded with only the
// one function this file uses typed here.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

type Row = Record<string, string | number | null>;
type Call = { table: string; method: string; args: unknown[] };

// A small stand-in for the three tables the list route reads. select, eq, in and
// order decide what comes back, so the route's own order is exercised.
const db = vi.hoisted(() => ({
  follows: [] as Row[],
  documents: [] as Row[],
  towns: [] as Row[],
  calls: [] as Call[],
}));

// The page gets its data only through useDocuments, so the hook is replaced by
// whatever state a test sets. No fetch, no localStorage, no effects.
const hook = vi.hoisted(() => ({ state: { status: 'loading' } as DocumentsState }));

vi.mock('../../app/(app)/documents/useDocuments', () => ({
  useDocuments: () => hook.state,
}));

vi.mock('../../lib/supabase', () => {
  type Order = { column: string; ascending: boolean };

  // Timestamps compare as instants, like PostgreSQL, not as text.
  function sortKey(column: string, value: unknown): number | string {
    return column === 'retrieved_at' ? Date.parse(String(value)) : (value as number | string);
  }

  function from(table: string) {
    const tables: Record<string, Row[]> = {
      user_followed_towns: db.follows,
      documents: db.documents,
      towns: db.towns,
    };
    const rows = tables[table];
    if (!rows) throw new Error(`The stand-in has no table ${table}`);

    let columns: string[] | null = null;
    const filters: { kind: 'eq' | 'in'; column: string; value: unknown }[] = [];
    const orders: Order[] = [];
    const record = (method: string, args: unknown[]) => db.calls.push({ table, method, args });

    const builder: unknown = {
      select(selected: string) {
        record('select', [selected]);
        columns = selected.split(',').map((name) => name.trim());
        return builder;
      },
      eq(column: string, value: unknown) {
        record('eq', [column, value]);
        filters.push({ kind: 'eq', column, value });
        return builder;
      },
      in(column: string, values: unknown[]) {
        record('in', [column, values]);
        filters.push({ kind: 'in', column, value: values });
        return builder;
      },
      order(column: string, options?: { ascending?: boolean }) {
        record('order', [column, options]);
        orders.push({ column, ascending: options?.ascending ?? true });
        return builder;
      },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        return Promise.resolve()
          .then(() => {
            if (!columns) throw new Error(`${table}: the query ran without select()`);
            const picked = columns;
            const data = rows
              .filter((row) =>
                filters.every((filter) =>
                  filter.kind === 'eq'
                    ? row[filter.column] === filter.value
                    : (filter.value as unknown[]).includes(row[filter.column]),
                ),
              )
              .sort((a, b) => {
                for (const { column, ascending } of orders) {
                  const x = sortKey(column, a[column]);
                  const y = sortKey(column, b[column]);
                  if (x < y) return ascending ? -1 : 1;
                  if (x > y) return ascending ? 1 : -1;
                }
                return 0;
              })
              .map((row) => Object.fromEntries(picked.map((column) => [column, row[column]])));
            return { data, error: null };
          })
          .then(resolve, reject);
      },
    };
    return builder;
  }

  return {
    getSupabaseClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn(async (token: string) =>
          token === 'valid-token'
            ? { data: { user: { id: 'user-123', email: 'resident@example.com' } }, error: null }
            : { data: { user: null }, error: { message: 'Invalid token' } },
        ),
      },
      from,
    })),
  };
});

import { GET } from '../../app/api/documents/route';
import DocumentsPage from '../../app/(app)/documents/page';

const TOWN_A = 1;
const USER = 'user-123'; // token "valid-token"
const FAILED_BADGE = 'Summary failed';
const PENDING_BADGE = 'Summary pending';
type SummaryStatus = DocumentListEntry['summary_status'];

function storedDoc(id: number, retrievedAt: string, status: SummaryStatus): Row {
  return {
    document_id: id,
    meeting_id: 1000 + id,
    town_id: TOWN_A,
    title: `Document ${id}`,
    retrieved_at: retrievedAt,
    summary_status: status,
    summary_text: status === 'Complete' ? 'A stored summary the list must not return.' : null,
    storage_path: `${TOWN_A}/file-${id}.pdf`,
  };
}

// Stored out of order. 302 and 301 share one retrieved_at, so only document_id breaks the tie.
const STORED_DOCUMENTS = [
  storedDoc(301, '2026-10-05T12:00:00+00:00', 'Failed'),
  storedDoc(303, '2026-09-01T12:00:00+00:00', 'Complete'),
  storedDoc(302, '2026-10-05T12:00:00+00:00', 'Pending'),
  storedDoc(304, '2026-10-10T12:00:00+00:00', 'Complete'),
];

function list() {
  return GET(new Request('http://localhost/api/documents', { headers: { authorization: 'Bearer valid-token' } }));
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  db.calls.length = 0;
  db.follows.splice(0, db.follows.length, { user_id: USER, town_id: TOWN_A });
  db.documents.splice(0, db.documents.length, ...STORED_DOCUMENTS.map((row) => ({ ...row })));
  db.towns.splice(0, db.towns.length, { town_id: TOWN_A, name: 'Town A', removed_at: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/documents: summary status on each entry (SRS-210.3)', () => {
  it('returns summary_status for a Pending, a Complete and a Failed document, in the list order', async () => {
    const response = await list();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.documents.map((row: DocumentListEntry) => [row.document_id, row.summary_status])).toEqual([
      [304, 'Complete'],
      [302, 'Pending'],
      [301, 'Failed'],
      [303, 'Complete'],
    ]);
  });

  it('adds summary_status to the existing fields and returns no summary text', async () => {
    const body = await (await list()).json();

    expect(body.documents[2]).toEqual({
      document_id: 301,
      title: 'Document 301',
      town_id: TOWN_A,
      meeting_id: 1301,
      retrieved_at: '2026-10-05T12:00:00+00:00',
      summary_status: 'Failed',
      town_name: 'Town A',
    });
    expect(JSON.stringify(body)).not.toContain('summary_text');
  });

  it('reads summary_status in the documents select and keeps the order calls', async () => {
    await list();

    const documentCalls = db.calls.filter((call) => call.table === 'documents');
    expect(documentCalls.map((call) => [call.method, ...call.args])).toEqual([
      ['select', 'document_id, title, town_id, meeting_id, retrieved_at, summary_status'],
      ['in', 'town_id', [TOWN_A]],
      ['order', 'retrieved_at', { ascending: false }],
      ['order', 'document_id', { ascending: false }],
    ]);
  });
});

function entry(document_id: number, title: string, summary_status: SummaryStatus, town_name: string | null = 'Town A'): DocumentListEntry {
  return { document_id, title, town_id: TOWN_A, meeting_id: 9, retrieved_at: '2026-10-01T12:00:00+00:00', summary_status, town_name };
}

// Vitest compiles this project's JSX to React.createElement, and the page does
// not import React, so React is stubbed as a global for the render.
function renderLoaded(documents: DocumentListEntry[]): string {
  hook.state = { status: 'loaded', documents };
  return renderToStaticMarkup(React.createElement(DocumentsPage));
}

function listItems(markup: string): string[] {
  return Array.from(markup.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g), ([, inner]) => inner);
}

function anchorsIn(markup: string): { href: string; text: string }[] {
  return Array.from(markup.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g), ([, href, inner]) => ({
    href,
    text: inner.replace(/<[^>]*>/g, ''),
  }));
}

function count(text: string, part: string): number {
  return text.split(part).length - 1;
}

describe('Documents page: Summary failed badge (SRS-210.3)', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    hook.state = { status: 'loading' };
  });

  it('shows the exact badge text once on a Failed entry, and no Summary pending badge', () => {
    const [item] = listItems(renderLoaded([entry(7, 'Agenda', 'Failed')]));

    expect(count(item, FAILED_BADGE)).toBe(1);
    expect(item).toContain(`<span class="text-danger">${FAILED_BADGE}</span>`);
    expect(item).not.toContain(PENDING_BADGE);
  });

  it.each<SummaryStatus>(['Complete', 'Pending'])('shows no badge on a %s entry', (status) => {
    const [item] = listItems(renderLoaded([entry(7, 'Agenda', status)]));

    expect(item).not.toContain(FAILED_BADGE);
    expect(item).not.toContain(PENDING_BADGE);
    expect(item).not.toContain('text-danger');
  });

  it('shows the badge only on the Failed entry of a mixed list', () => {
    const items = listItems(renderLoaded([
      entry(1, 'First', 'Pending'),
      entry(2, 'Second', 'Failed'),
      entry(3, 'Third', 'Complete'),
    ]));

    expect(items.map((inner) => count(inner, FAILED_BADGE))).toEqual([0, 1, 0]);
  });

  it('places the badge right after the town tag, in the same tag area', () => {
    const [item] = listItems(renderLoaded([entry(7, 'Agenda', 'Failed')]));

    expect(item).toContain(`<span class="text-fg-muted">Town A</span> <span class="text-danger">${FAILED_BADGE}</span>`);
    const area = item.match(/<div class="flex min-w-0 flex-1[^"]*">([\s\S]*)<\/div>/)?.[1] ?? '';
    expect(area).toContain('Town A');
    expect(area).toContain(FAILED_BADGE);
  });

  it('still shows the badge on a Failed entry whose town name is null', () => {
    const [item] = listItems(renderLoaded([entry(7, 'Agenda', 'Failed', null)]));

    expect(count(item, FAILED_BADGE)).toBe(1);
    expect(item).not.toContain('text-fg-muted');
  });

  it('keeps the title link and town tag of a Failed entry the same as a Complete one', () => {
    const [failed] = listItems(renderLoaded([entry(7, 'Agenda', 'Failed')]));
    const [complete] = listItems(renderLoaded([entry(7, 'Agenda', 'Complete')]));

    expect(anchorsIn(failed)).toEqual([{ href: '/documents/7', text: 'Agenda' }]);
    expect(anchorsIn(failed)).toEqual(anchorsIn(complete));
    expect(failed).toContain('<span class="text-fg-muted">Town A</span>');
    expect(failed.replace(` <span class="text-danger">${FAILED_BADGE}</span>`, '')).toBe(complete);
  });
});
