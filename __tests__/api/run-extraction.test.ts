// Tests for SRS-302.1: running an extraction from Queued to Completed or Failed.
// CivicClerk and the Claude API are replaced by stubs, so nothing leaves the machine.
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { MAX_FILE_BYTES, runExtraction, type RunDeps } from '../../lib/extraction/runExtraction';
import { DocumentTextError } from '../../lib/sources/civicclerkFiles';
import type { FoundOfficial } from '../../lib/extraction/findOfficials';

type Row = Record<string, unknown>;

// Small in-memory stand-in for the Supabase tables runExtraction uses.
function createDb(seed: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));

  function from(table: string) {
    let op: 'select' | 'update' | 'insert' | 'delete' = 'select';
    let values: Row | Row[] | null = null;
    const filters: [string, unknown][] = [];
    const matches = (row: Row) => filters.every(([column, value]) => row[column] === value);

    function run(): Row[] {
      const rows = (tables[table] ??= []);
      if (op === 'insert') {
        const added = (Array.isArray(values) ? values : [values as Row]).map((row, i) => ({
          extracted_official_id: rows.length + i + 1,
          ...row,
        }));
        rows.push(...added);
        return added;
      }
      const hit = rows.filter(matches);
      if (op === 'update') hit.forEach((row) => Object.assign(row, values));
      if (op === 'delete') tables[table] = rows.filter((row) => !matches(row));
      return hit.map((row) => ({ ...row }));
    }

    const query = {
      select: () => query,
      update: (v: Row) => { op = 'update'; values = v; return query; },
      insert: (v: Row[]) => { op = 'insert'; values = v; return query; },
      delete: () => { op = 'delete'; return query; },
      eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
      order: () => query,
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: run(), error: null }).then(resolve, reject),
    };
    return query;
  }

  return { supabase: { from } as unknown as SupabaseClient, tables };
}

const OWNER = 'user-123';
const NOW = '2026-10-13T18:00:00.000Z';

function seed(extraction: Row = {}, document: Row = {}) {
  return {
    extractions: [{
      extraction_id: 7, user_id: OWNER, document_id: 1, status: 'Queued',
      failure_cause: null, completed_at: null, ...extraction,
    }],
    documents: [{ document_id: 1, town_id: 1, source_file_id: '1169', file_size_bytes: 245760, ...document }],
    towns: [{ town_id: 1, source_account_id: 'salemma' }],
    extracted_officials: [],
  };
}

const CLERK: FoundOfficial = {
  full_name: 'Maureen Elizabeth Fisher', title: 'City Clerk', role: null,
  email: 'clerk@salem.com', phone: '978-555-0100',
};
const CHAIR: FoundOfficial = {
  full_name: 'Jonathan Berk', title: null, role: 'Planning Board Chair', email: null, phone: null,
};

function deps(overrides: Partial<RunDeps> = {}): RunDeps {
  return {
    fetchText: vi.fn(async () => 'Attest: Maureen Elizabeth Fisher, City Clerk ...'),
    findOfficials: vi.fn(async () => [CLERK, CHAIR]),
    now: () => NOW,
    ...overrides,
  };
}

describe('runExtraction (SRS-302.1)', () => {
  it('reads the document, saves each official, and ends Completed', async () => {
    const { supabase, tables } = createDb(seed());
    const stubs = deps();

    const result = await runExtraction(supabase, 7, OWNER, stubs);

    expect(result).toEqual({ outcome: 'ran', status: 'Completed', officialsFound: 2 });
    expect(stubs.fetchText).toHaveBeenCalledWith('salemma', '1169');
    expect(tables.extractions[0]).toMatchObject({ status: 'Completed', completed_at: NOW, failure_cause: null });
    expect(tables.extracted_officials).toHaveLength(2);
    expect(tables.extracted_officials[0]).toMatchObject({ extraction_id: 7, ...CLERK });
    expect(tables.extracted_officials[1]).toMatchObject({ extraction_id: 7, ...CHAIR });
  });

  it('is Processing while the document is being read', async () => {
    const { supabase, tables } = createDb(seed());
    let statusWhileReading: unknown = null;

    await runExtraction(supabase, 7, OWNER, deps({
      fetchText: async () => { statusWhileReading = tables.extractions[0].status; return 'text'; },
    }));

    expect(statusWhileReading).toBe('Processing');
  });

  it('ends Completed with no officials when the document names nobody', async () => {
    const { supabase, tables } = createDb(seed());

    const result = await runExtraction(supabase, 7, OWNER, deps({ findOfficials: async () => [] }));

    expect(result).toEqual({ outcome: 'ran', status: 'Completed', officialsFound: 0 });
    expect(tables.extracted_officials).toHaveLength(0);
  });

  it("does not run someone else's extraction, and reports it as denied (SRS-310.2)", async () => {
    const { supabase, tables } = createDb(seed({ user_id: 'someone-else' }));
    const stubs = deps();

    const result = await runExtraction(supabase, 7, OWNER, stubs);

    expect(result).toEqual({ outcome: 'denied' });
    expect(tables.extractions[0].status).toBe('Queued');
    expect(stubs.fetchText).not.toHaveBeenCalled();
  });

  it('does not run an extraction that is not Queued', async () => {
    const { supabase } = createDb(seed({ status: 'Completed', completed_at: NOW }));
    const stubs = deps();

    const result = await runExtraction(supabase, 7, OWNER, stubs);

    expect(result).toEqual({ outcome: 'not_queued', status: 'Completed' });
    expect(stubs.fetchText).not.toHaveBeenCalled();
  });

  it('fails with "Missing source file" when the document was removed', async () => {
    const { supabase, tables } = createDb(seed({ document_id: null }));
    const stubs = deps();

    await runExtraction(supabase, 7, OWNER, stubs);

    expect(tables.extractions[0]).toMatchObject({ status: 'Failed', failure_cause: 'Missing source file', completed_at: NOW });
    expect(stubs.fetchText).not.toHaveBeenCalled();
  });

  it('fails with "File too large" for a file over the size limit', async () => {
    const { supabase, tables } = createDb(seed({}, { file_size_bytes: MAX_FILE_BYTES + 1 }));

    await runExtraction(supabase, 7, OWNER, deps());

    expect(tables.extractions[0]).toMatchObject({ status: 'Failed', failure_cause: 'File too large' });
  });

  it('keeps the cause CivicClerk reported (e.g. "Unreadable file")', async () => {
    const { supabase, tables } = createDb(seed());

    await runExtraction(supabase, 7, OWNER, deps({
      fetchText: async () => { throw new DocumentTextError('Unreadable file', 'no text'); },
    }));

    expect(tables.extractions[0]).toMatchObject({ status: 'Failed', failure_cause: 'Unreadable file' });
  });

  it('fails with "Other" and saves no officials when the Claude API fails', async () => {
    const { supabase, tables } = createDb(seed());

    await runExtraction(supabase, 7, OWNER, deps({
      findOfficials: async () => { throw new Error('status 529'); },
    }));

    expect(tables.extractions[0]).toMatchObject({ status: 'Failed', failure_cause: 'Other' });
    expect(tables.extracted_officials).toHaveLength(0);
  });
});
