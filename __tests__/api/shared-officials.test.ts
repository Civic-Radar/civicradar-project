// Tests for SRS-311.2, AO, Merge repeated officials.
// "When an extraction finds an official already in the shared list, the system
//  shall update that entry instead of creating a second one."
//
// Acceptance:
//   * A name match with the same body creates no duplicate entry.
//   * The entry shows the most recent title and contact details found.
//   * The entry keeps a link to every source document it came from.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { addToSharedOfficials, nameKey } from '../../lib/extraction/sharedOfficials';
import { runExtraction, type RunDeps } from '../../lib/extraction/runExtraction';
import type { FoundOfficial } from '../../lib/extraction/findOfficials';

type Row = Record<string, unknown>;

// In-memory stand-in for the tables. Enforces the same unique rules as the
// database: officials (body_id, lower(full_name)) and official_sources (official_id, document_id).
function createDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  let nextId = 100;

  function violatesUnique(table: string, row: Row): boolean {
    const rows = tables[table] ?? [];
    if (table === 'officials') {
      return rows.some((r) => r.body_id === row.body_id && String(r.full_name).toLowerCase() === String(row.full_name).toLowerCase());
    }
    if (table === 'official_sources') {
      return rows.some((r) => r.official_id === row.official_id && r.document_id === row.document_id);
    }
    return false;
  }

  function from(table: string) {
    let op: 'select' | 'update' | 'insert' | 'upsert' | 'delete' = 'select';
    let values: Row | Row[] | null = null;
    let ignoreDuplicates = false;
    const filters: [string, unknown][] = [];
    const matches = (row: Row) => filters.every(([column, value]) => row[column] === value);

    function run(): { data: Row[]; error: { code: string } | null } {
      const rows = (tables[table] ??= []);
      if (op === 'insert' || op === 'upsert') {
        const added: Row[] = [];
        for (const row of Array.isArray(values) ? values : [values as Row]) {
          if (violatesUnique(table, row)) {
            if (op === 'upsert' && ignoreDuplicates) continue;
            return { data: [], error: { code: '23505' } };
          }
          const stored = table === 'officials' ? { official_id: nextId++, ...row } : { ...row };
          rows.push(stored);
          added.push(stored);
        }
        return { data: added, error: null };
      }
      const hit = rows.filter(matches);
      if (op === 'update') hit.forEach((row) => Object.assign(row, values));
      if (op === 'delete') tables[table] = rows.filter((row) => !matches(row));
      return { data: hit.map((row) => ({ ...row })), error: null };
    }

    const query = {
      select: () => query,
      update: (v: Row) => { op = 'update'; values = v; return query; },
      insert: (v: Row | Row[]) => { op = 'insert'; values = v; return query; },
      upsert: (v: Row, opts?: { ignoreDuplicates?: boolean }) => { op = 'upsert'; values = v; ignoreDuplicates = !!opts?.ignoreDuplicates; return query; },
      delete: () => { op = 'delete'; return query; },
      eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
      order: () => query,
      maybeSingle: async () => { const r = run(); return { data: r.data[0] ?? null, error: r.error }; },
      single: async () => { const r = run(); return { data: r.data[0] ?? null, error: r.error }; },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return query;
  }

  return { supabase: { from } as unknown as SupabaseClient, tables };
}

// Two City Council documents (meetings 7 and 10, body 1), and one meeting with no body.
function seed() {
  return {
    documents: [
      { document_id: 13, meeting_id: 7 },
      { document_id: 19, meeting_id: 10 },
      { document_id: 30, meeting_id: 40 },
    ],
    meetings: [
      { meeting_id: 7, body_id: 1 },
      { meeting_id: 10, body_id: 1 },
      { meeting_id: 40, body_id: null },
    ],
    officials: [],
    official_sources: [],
  };
}

const FISHER_OCT_19: FoundOfficial = {
  full_name: 'Maureen Elizabeth Fisher', title: 'City Clerk', role: null, email: null, phone: null,
};
const FISHER_OCT_15: FoundOfficial = {
  full_name: 'maureen elizabeth  fisher', title: 'Acting City Clerk', role: 'Clerk of the meeting',
  email: 'mfisher@salem.com', phone: '978-619-5614',
};

describe('Merge repeated officials (SRS-311.2)', () => {
  it('adds a new official to the shared list, in the body of the document\'s meeting', async () => {
    const { supabase, tables } = createDb(seed());

    const result = await addToSharedOfficials(supabase, 13, [FISHER_OCT_19]);

    expect(result).toEqual({ added: 1, updated: 0, skipped: 0 });
    expect(tables.officials).toHaveLength(1);
    expect(tables.officials[0]).toMatchObject({ body_id: 1, full_name: 'Maureen Elizabeth Fisher', title: 'City Clerk', details_document_id: 13 });
  });

  it('updates the entry instead of creating a second one when the same name is found in the same body', async () => {
    const { supabase, tables } = createDb(seed());

    await addToSharedOfficials(supabase, 13, [FISHER_OCT_19]);
    const result = await addToSharedOfficials(supabase, 19, [FISHER_OCT_15]);

    expect(result).toEqual({ added: 0, updated: 1, skipped: 0 });
    expect(tables.officials).toHaveLength(1);
  });

  it('shows the most recent title and contact details found', async () => {
    const { supabase, tables } = createDb(seed());

    await addToSharedOfficials(supabase, 13, [FISHER_OCT_19]);
    await addToSharedOfficials(supabase, 19, [FISHER_OCT_15]);

    expect(tables.officials[0]).toMatchObject({
      title: 'Acting City Clerk', role: 'Clerk of the meeting',
      email: 'mfisher@salem.com', phone: '978-619-5614', details_document_id: 19,
    });
  });

  it('never blanks out a detail that a later document did not give', async () => {
    const { supabase, tables } = createDb(seed());

    await addToSharedOfficials(supabase, 19, [FISHER_OCT_15]);
    await addToSharedOfficials(supabase, 13, [FISHER_OCT_19]);

    expect(tables.officials[0]).toMatchObject({ title: 'City Clerk', email: 'mfisher@salem.com', phone: '978-619-5614' });
  });

  it('keeps a link to every source document it came from', async () => {
    const { supabase, tables } = createDb(seed());

    await addToSharedOfficials(supabase, 13, [FISHER_OCT_19]);
    await addToSharedOfficials(supabase, 19, [FISHER_OCT_15]);
    await addToSharedOfficials(supabase, 19, [FISHER_OCT_15]);

    const officialId = tables.officials[0].official_id;
    expect(tables.official_sources).toEqual([
      { official_id: officialId, document_id: 13 },
      { official_id: officialId, document_id: 19 },
    ]);
  });

  it('keeps people with different names as separate entries', async () => {
    const { supabase, tables } = createDb(seed());

    await addToSharedOfficials(supabase, 13, [
      FISHER_OCT_19,
      { full_name: 'Jonathan Berk', title: 'Planning Board Chair', role: null, email: null, phone: null },
    ]);

    expect(tables.officials.map((o) => o.full_name)).toEqual(['Maureen Elizabeth Fisher', 'Jonathan Berk']);
  });

  it('skips officials from a meeting with no governing body', async () => {
    const { supabase, tables } = createDb(seed());

    const result = await addToSharedOfficials(supabase, 30, [FISHER_OCT_19]);

    expect(result).toEqual({ added: 0, updated: 0, skipped: 1 });
    expect(tables.officials).toHaveLength(0);
    expect(tables.official_sources).toHaveLength(0);
  });

  it('matches names the same way as the database index: ignoring letter case and extra spaces', () => {
    expect(nameKey('  Maureen   Elizabeth FISHER ')).toBe(nameKey('maureen elizabeth fisher'));
  });
});

describe('Running an extraction adds its officials to the shared list (SRS-311.2)', () => {
  function runSeed() {
    return {
      ...seed(),
      extractions: [{ extraction_id: 7, user_id: 'user-1', document_id: 19, status: 'Queued', failure_cause: null, completed_at: null }],
      documents: [{ document_id: 19, meeting_id: 10, town_id: 1, source_file_id: '1170', file_size_bytes: 1000 }],
      towns: [{ town_id: 1, source_account_id: 'salemma' }],
      extracted_officials: [],
    };
  }
  const deps = (overrides: Partial<RunDeps> = {}): RunDeps => ({
    fetchText: async () => 'Contact the City Clerk at mfisher@salem.com',
    findOfficials: async () => [FISHER_OCT_15],
    now: () => '2026-10-22T18:00:00.000Z',
    ...overrides,
  });

  it('sends the document and its officials to the shared list', async () => {
    const { supabase } = createDb(runSeed());
    const shareOfficials = vi.fn(async () => ({}));

    await runExtraction(supabase, 7, 'user-1', deps({ shareOfficials }));

    expect(shareOfficials).toHaveBeenCalledWith(supabase, 19, [FISHER_OCT_15]);
  });

  it('still completes the extraction if the shared list cannot be updated', async () => {
    const { supabase, tables } = createDb(runSeed());
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runExtraction(supabase, 7, 'user-1', deps({ shareOfficials: async () => { throw new Error('down'); } }));

    expect(result).toEqual({ outcome: 'ran', status: 'Completed', officialsFound: 1 });
    expect(tables.extracted_officials).toHaveLength(1);
  });
});
