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

// A small stand-in for the three tables the list route reads. select, eq and in
// decide what comes back; order is recorded only, because the fixtures are
// stored in the route's order (the order itself is covered in document-list.test.ts).
const db = vi.hoisted(() => ({
  follows: [] as Row[],
  documents: [] as Row[],
  towns: [] as Row[],
  calls: [] as Call[],
  failures: {} as Record<string, { message: string }>,
}));

// The page gets its data only through useDocuments, so the hook is replaced by
// whatever state a test sets. No fetch, no localStorage, no effects.
const hook = vi.hoisted(() => ({ state: { status: 'loading' } as DocumentsState }));

vi.mock('../../app/(app)/documents/useDocuments', () => ({
  useDocuments: () => hook.state,
}));

vi.mock('../../lib/supabase', () => {
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
      order(...args: unknown[]) {
        record('order', args);
        return builder;
      },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        return Promise.resolve()
          .then(() => {
            const failure = db.failures[table];
            if (failure) return { data: null, error: failure };
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
const TOWN_B = 2;
const USER = 'user-123'; // token "valid-token"
const LOAD_ERROR = 'Documents could not be loaded. Please try again.';
const dbError = { message: 'relation "towns" does not exist (42P01)' };

function storedDoc(id: number, townId: number, retrievedAt: string): Row {
  return {
    document_id: id,
    meeting_id: 1000 + id,
    town_id: townId,
    title: `Document ${id}`,
    retrieved_at: retrievedAt,
    storage_path: `${townId}/file-${id}.pdf`,
  };
}

// Stored in the route's order: newest retrieved_at first, then highest document_id.
const STORED_DOCUMENTS = [
  storedDoc(201, TOWN_B, '2026-10-10T12:00:00+00:00'),
  storedDoc(102, TOWN_A, '2026-10-05T12:00:00+00:00'),
  storedDoc(101, TOWN_A, '2026-09-01T12:00:00+00:00'),
  storedDoc(202, TOWN_B, '2026-08-15T12:00:00+00:00'),
];

const STORED_TOWNS: Row[] = [
  { town_id: TOWN_A, name: 'Town A', source_account_id: 'account-a', removed_at: null },
  { town_id: TOWN_B, name: 'Town B', source_account_id: 'account-b', removed_at: null },
];

function follow(...townIds: number[]) {
  for (const townId of townIds) db.follows.push({ user_id: USER, town_id: townId });
}

function list() {
  return GET(new Request('http://localhost/api/documents', { headers: { authorization: 'Bearer valid-token' } }));
}

function callsTo(table: string, method?: string) {
  return db.calls.filter((call) => call.table === table && (!method || call.method === method));
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  db.calls.length = 0;
  db.failures = {};
  db.follows.length = 0;
  db.documents.splice(0, db.documents.length, ...STORED_DOCUMENTS.map((row) => ({ ...row })));
  db.towns.splice(0, db.towns.length, ...STORED_TOWNS.map((row) => ({ ...row })));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GET /api/documents: town name on each entry (SRS-212.1)', () => {
  it('returns the town name on each entry, next to the existing fields', async () => {
    follow(TOWN_A);

    const response = await list();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      documents: [
        { document_id: 102, meeting_id: 1102, town_id: TOWN_A, title: 'Document 102', retrieved_at: '2026-10-05T12:00:00+00:00', town_name: 'Town A' },
        { document_id: 101, meeting_id: 1101, town_id: TOWN_A, title: 'Document 101', retrieved_at: '2026-09-01T12:00:00+00:00', town_name: 'Town A' },
      ],
    });
  });

  it('gives documents from two towns each their own town name', async () => {
    follow(TOWN_A, TOWN_B);

    const body = await (await list()).json();

    expect(body.documents.map((row: DocumentListEntry) => [row.document_id, row.town_id, row.town_name])).toEqual([
      [201, TOWN_B, 'Town B'],
      [102, TOWN_A, 'Town A'],
      [101, TOWN_A, 'Town A'],
      [202, TOWN_B, 'Town B'],
    ]);
  });

  it('reads towns once, with the exact select and the followed town ids', async () => {
    follow(TOWN_A, TOWN_B);

    await list();

    expect(callsTo('towns')).toEqual([
      { table: 'towns', method: 'select', args: ['town_id, name'] },
      { table: 'towns', method: 'in', args: ['town_id', [TOWN_A, TOWN_B]] },
    ]);
  });

  it('returns 500 with the fixed message, not the database error, when the towns read fails', async () => {
    follow(TOWN_A);
    db.failures.towns = dbError;

    const response = await list();
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: LOAD_ERROR });
    expect(text).not.toContain(dbError.message);
    expect(text).not.toContain('42P01');
    expect(callsTo('towns', 'select')).toHaveLength(1);
  });

  it('keeps a document listed with town_name null when its town has no name in the towns read', async () => {
    follow(TOWN_A, TOWN_B);
    db.towns.splice(1, 1); // Town B's row is not returned

    const body = await (await list()).json();

    expect(body.documents.map((row: DocumentListEntry) => [row.document_id, row.town_name])).toEqual([
      [201, null],
      [102, 'Town A'],
      [101, 'Town A'],
      [202, null],
    ]);
  });
});

function entry(document_id: number, title: string, town_name: string | null): DocumentListEntry {
  return { document_id, title, town_id: 1, meeting_id: 9, retrieved_at: '2026-10-01T12:00:00+00:00', town_name };
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

// The entry with its link removed, as visible text only.
function textOutsideLinks(markup: string): string {
  return markup.replace(/<a\b[^>]*>[\s\S]*?<\/a>/g, '').replace(/<[^>]*>/g, '');
}

describe('Documents page: town tag on each list entry (SRS-212.1)', () => {
  beforeEach(() => {
    vi.stubGlobal('React', React);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    hook.state = { status: 'loading' };
  });

  it('shows each entry its own town name as plain text outside the title link', () => {
    const items = listItems(renderLoaded([entry(7, 'Agenda', 'Town A'), entry(60, 'Minutes', 'Town B')]));

    expect(items).toHaveLength(2);
    expect(items.map((inner) => textOutsideLinks(inner).trim())).toEqual(['Town A', 'Town B']);
    expect(items.map((inner) => anchorsIn(inner).map((a) => a.text))).toEqual([['Agenda'], ['Minutes']]);
    expect(items[0]).toContain('<span class="text-fg-muted">Town A</span>');
    expect(items[1]).toContain('<span class="text-fg-muted">Town B</span>');
  });

  it('shows no tag for an entry whose town name is null', () => {
    const [item] = listItems(renderLoaded([entry(7, 'Agenda', null)]));

    expect(textOutsideLinks(item)).toBe('');
    expect(item).not.toContain('<span');
    expect(anchorsIn(item).map((a) => a.text)).toEqual(['Agenda']);
  });

  it('keeps each title link target at /documents/<document_id>', () => {
    const markup = renderLoaded([entry(7, 'Agenda', 'Town A'), entry(60, 'Minutes', 'Town B'), entry(1, 'Packet', null)]);

    expect(anchorsIn(markup).filter((a) => a.href.startsWith('/documents/'))).toEqual([
      { href: '/documents/7', text: 'Agenda' },
      { href: '/documents/60', text: 'Minutes' },
      { href: '/documents/1', text: 'Packet' },
    ]);
  });
});
