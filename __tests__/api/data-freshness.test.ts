// SRS-102.1, SRS-102.2, SRS-102.3, KJ, Data freshness
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

// A small in-memory database. A source_checks select also returns each check's
// source_check_collections rows, as the embedded select does in Supabase.
const db = vi.hoisted(() => ({ tables: {} as Record<string, Row[]>, failOn: null as string | null }));

vi.mock('../../lib/supabase', () => {
  function query(table: string) {
    const filters: ((row: Row) => boolean)[] = [];
    const sorts: { column: string; ascending: boolean }[] = [];
    let max = Infinity;

    function run() {
      if (db.failOn === table) return { data: null, error: { message: 'database down' } };
      let rows = (db.tables[table] ?? []).filter((row) => filters.every((match) => match(row)));
      rows = [...rows].sort((a, b) => {
        for (const { column, ascending } of sorts) {
          if (a[column] === b[column]) continue;
          return ((a[column] as string | number) < (b[column] as string | number) ? -1 : 1) * (ascending ? 1 : -1);
        }
        return 0;
      });
      rows = rows.slice(0, max);
      if (table === 'source_checks') {
        rows = rows.map((row) => ({
          ...row,
          source_check_collections: (db.tables.source_check_collections ?? [])
            .filter((collection) => collection.check_id === row.check_id)
            .map((collection) => ({ result: collection.result })),
        }));
      }
      return { data: rows, error: null };
    }

    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => { filters.push((row) => row[column] === value); return builder; },
      in: (column: string, values: unknown[]) => { filters.push((row) => values.includes(row[column])); return builder; },
      is: (column: string, value: unknown) => { filters.push((row) => (row[column] ?? null) === value); return builder; },
      not: (column: string, _operator: string, value: unknown) => { filters.push((row) => (row[column] ?? null) !== value); return builder; },
      order: (column: string, options?: { ascending?: boolean }) => {
        sorts.push({ column, ascending: options?.ascending ?? true });
        return builder;
      },
      limit: (count: number) => { max = count; return builder; },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return builder;
  }

  return {
    getSupabaseClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn(async (token: string) =>
          token === 'resident-token'
            ? { data: { user: { id: 'resident-1', email: 'resident@example.com' } }, error: null }
            : { data: { user: null }, error: { message: 'Invalid token' } },
        ),
      },
      from: vi.fn((table: string) => query(table)),
    })),
  };
});

import { GET } from '../../app/api/data-freshness/route';

const SALEM = 1;
const BEVERLY = 2;
const LYNN = 3;

function req(token: string | null = 'resident-token') {
  return new Request('http://localhost/api/data-freshness', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function freshness() {
  const response = await GET(req());
  expect(response.status).toBe(200);
  return (await response.json()).towns as {
    town_id: number;
    name: string;
    last_successful_check: string | null;
    latest_check_failed: boolean;
    no_new_information: boolean;
  }[];
}

function addCheck(
  checkId: number,
  townId: number,
  endedAt: string | null,
  results: string[] = ['Complete'],
  changesFound: boolean = true,
) {
  db.tables.source_checks.push({
    check_id: checkId,
    town_id: townId,
    started_at: endedAt ? new Date(Date.parse(endedAt) - 60_000).toISOString() : '2026-09-23T23:00:00.000Z',
    ended_at: endedAt,
    changes_found: endedAt ? changesFound : null,
  });
  results.forEach((result, index) => db.tables.source_check_collections.push({ check_id: checkId, collection: `C${index}`, result }));
}

describe('Last check time display (SRS-102.1)', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
    db.failOn = null;
    db.tables = {
      towns: [
        { town_id: SALEM, name: 'Salem', meeting_time_zone: 'America/New_York', removed_at: null },
        { town_id: BEVERLY, name: 'Beverly', meeting_time_zone: 'America/New_York', removed_at: null },
        { town_id: LYNN, name: 'Lynn', meeting_time_zone: 'America/New_York', removed_at: null },
      ],
      user_followed_towns: [{ user_id: 'resident-1', town_id: SALEM }],
      source_checks: [],
      source_check_collections: [],
    };
  });

  // Acceptance criterion: Salem's most recent successful check ended on 09/23/2026 at 2:00 PM ET.
  it('shows "09/23/2026 2:00 PM ET" for Salem', async () => {
    addCheck(1, SALEM, '2026-09-23T15:00:00.000Z');
    addCheck(2, SALEM, '2026-09-23T18:00:00.000Z');

    expect(await freshness()).toEqual([
      { town_id: SALEM, name: 'Salem', last_successful_check: '09/23/2026 2:00 PM ET', latest_check_failed: false, no_new_information: false },
    ]);
  });

  it('shows the most recent successful check, not a newer one that failed', async () => {
    addCheck(1, SALEM, '2026-09-23T18:00:00.000Z');
    addCheck(2, SALEM, '2026-09-23T21:00:00.000Z', ['Complete', 'Failed']);

    expect((await freshness())[0].last_successful_check).toBe('09/23/2026 2:00 PM ET');
  });

  it('ignores a check that is still running', async () => {
    addCheck(1, SALEM, '2026-09-23T18:00:00.000Z');
    addCheck(2, SALEM, null);

    expect((await freshness())[0].last_successful_check).toBe('09/23/2026 2:00 PM ET');
  });

  it('shows each followed town with its own time, sorted by name', async () => {
    db.tables.user_followed_towns.push({ user_id: 'resident-1', town_id: BEVERLY });
    addCheck(1, SALEM, '2026-09-23T18:00:00.000Z');
    addCheck(2, BEVERLY, '2026-09-22T13:30:00.000Z');

    expect(await freshness()).toEqual([
      { town_id: BEVERLY, name: 'Beverly', last_successful_check: '09/22/2026 9:30 AM ET', latest_check_failed: false, no_new_information: false },
      { town_id: SALEM, name: 'Salem', last_successful_check: '09/23/2026 2:00 PM ET', latest_check_failed: false, no_new_information: false },
    ]);
  });

  it('leaves out towns the resident does not follow and towns removed from the catalog', async () => {
    db.tables.user_followed_towns.push({ user_id: 'resident-1', town_id: BEVERLY });
    db.tables.towns[1].removed_at = '2026-09-01T00:00:00.000Z';
    addCheck(1, LYNN, '2026-09-23T18:00:00.000Z');

    expect((await freshness()).map((town) => town.name)).toEqual(['Salem']);
  });

  it('returns null for a followed town with no successful check yet', async () => {
    addCheck(1, SALEM, '2026-09-23T18:00:00.000Z', ['Failed']);

    expect(await freshness()).toEqual([{ town_id: SALEM, name: 'Salem', last_successful_check: null, latest_check_failed: true, no_new_information: false }]);
  });

  it('returns an empty list when the resident follows no towns', async () => {
    db.tables.user_followed_towns = [];

    expect(await freshness()).toEqual([]);
  });

  it('returns 401 without a token', async () => {
    expect((await GET(req(null))).status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    expect((await GET(req('bad-token'))).status).toBe(401);
  });

  it('returns 500 when the checks cannot be read', async () => {
    addCheck(1, SALEM, '2026-09-23T18:00:00.000Z');
    db.failOn = 'source_checks';

    const response = await GET(req());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Data freshness could not be loaded. Please try again.' });
  });
});

describe('Failed check label (SRS-102.2)', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
    db.failOn = null;
    db.tables = {
      towns: [
        { town_id: SALEM, name: 'Salem', meeting_time_zone: 'America/New_York', removed_at: null },
        { town_id: BEVERLY, name: 'Beverly', meeting_time_zone: 'America/New_York', removed_at: null },
      ],
      user_followed_towns: [{ user_id: 'resident-1', town_id: SALEM }],
      source_checks: [],
      source_check_collections: [],
    };
  });

  // Acceptance criterion: Salem's most recent check was not successful, so "Could not check the source" is shown.
  it('marks Salem when its most recent check failed, and still shows its last successful check', async () => {
    addCheck(1, SALEM, '2026-09-23T18:00:00.000Z');
    addCheck(2, SALEM, '2026-09-23T21:00:00.000Z', ['Complete', 'Failed']);

    expect(await freshness()).toEqual([
      { town_id: SALEM, name: 'Salem', last_successful_check: '09/23/2026 2:00 PM ET', latest_check_failed: true, no_new_information: false },
    ]);
  });

  it('does not mark Salem when an older check failed but the most recent one was successful', async () => {
    addCheck(1, SALEM, '2026-09-23T18:00:00.000Z', ['Failed']);
    addCheck(2, SALEM, '2026-09-23T21:00:00.000Z');

    expect((await freshness())[0].latest_check_failed).toBe(false);
  });

  it('judges the most recent finished check, not one that is still running', async () => {
    addCheck(1, SALEM, '2026-09-23T18:00:00.000Z', ['Failed']);
    addCheck(2, SALEM, null);

    expect((await freshness())[0].latest_check_failed).toBe(true);
  });

  it('does not mark a town that has not been checked yet', async () => {
    expect(await freshness()).toEqual([
      { town_id: SALEM, name: 'Salem', last_successful_check: null, latest_check_failed: false, no_new_information: false },
    ]);
  });

  it('marks only the town whose most recent check failed', async () => {
    db.tables.user_followed_towns.push({ user_id: 'resident-1', town_id: BEVERLY });
    addCheck(1, SALEM, '2026-09-23T21:00:00.000Z', ['Failed']);
    addCheck(2, BEVERLY, '2026-09-23T21:00:00.000Z');

    const towns = await freshness();

    expect(towns.find((town) => town.name === 'Salem')?.latest_check_failed).toBe(true);
    expect(towns.find((town) => town.name === 'Beverly')?.latest_check_failed).toBe(false);
  });
});

describe('No new information label (SRS-102.3)', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
    db.failOn = null;
    db.tables = {
      towns: [
        { town_id: SALEM, name: 'Salem', meeting_time_zone: 'America/New_York', removed_at: null },
        { town_id: BEVERLY, name: 'Beverly', meeting_time_zone: 'America/New_York', removed_at: null },
      ],
      user_followed_towns: [{ user_id: 'resident-1', town_id: SALEM }],
      source_checks: [],
      source_check_collections: [],
    };
  });

  // Acceptance criterion: Salem's most recent check was successful and found nothing new, so
  // "Checked — no new information" is shown and "Could not check the source" is not.
  it('marks Salem as checked with no new information, and not as failed', async () => {
    addCheck(1, SALEM, '2026-09-23T18:00:00.000Z', ['Complete'], false);

    expect(await freshness()).toEqual([
      { town_id: SALEM, name: 'Salem', last_successful_check: '09/23/2026 2:00 PM ET', latest_check_failed: false, no_new_information: true },
    ]);
  });

  it('does not mark Salem when its most recent check found new or changed records', async () => {
    addCheck(1, SALEM, '2026-09-23T18:00:00.000Z', ['Complete'], true);

    expect((await freshness())[0].no_new_information).toBe(false);
  });

  it('does not mark Salem when its most recent check failed, even though it found nothing new', async () => {
    addCheck(1, SALEM, '2026-09-23T18:00:00.000Z', ['Complete', 'Failed'], false);

    const [salem] = await freshness();

    expect(salem.no_new_information).toBe(false);
    expect(salem.latest_check_failed).toBe(true);
  });

  it('judges only the most recent finished check, not an older one that found nothing new', async () => {
    addCheck(1, SALEM, '2026-09-23T15:00:00.000Z', ['Complete'], false);
    addCheck(2, SALEM, '2026-09-23T18:00:00.000Z', ['Complete'], true);
    addCheck(3, SALEM, null);

    expect((await freshness())[0].no_new_information).toBe(false);
  });

  it('does not mark a town that has not been checked yet', async () => {
    expect((await freshness())[0].no_new_information).toBe(false);
  });

  it('marks each followed town on its own', async () => {
    db.tables.user_followed_towns.push({ user_id: 'resident-1', town_id: BEVERLY });
    addCheck(1, SALEM, '2026-09-23T18:00:00.000Z', ['Complete'], false);
    addCheck(2, BEVERLY, '2026-09-23T18:00:00.000Z', ['Complete'], true);

    const towns = await freshness();

    expect(towns.find((town) => town.name === 'Salem')?.no_new_information).toBe(true);
    expect(towns.find((town) => town.name === 'Beverly')?.no_new_information).toBe(false);
  });
});