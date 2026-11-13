// SRS-102.1, SRS-102.2, SRS-102.3, KJ, Data freshness
import { describe, expect, it } from 'vitest';
import {
  formatCheckTime,
  isSuccessfulCheck,
  lastSuccessfulCheckAt,
  latestCheckFailed,
  latestCheckFoundNothingNew,
} from '../../lib/dataFreshness';

function check(id: number, endedAt: string | null, results: string[] = ['Complete'], changesFound = true) {
  return {
    check_id: id,
    started_at: endedAt ?? '2026-09-23T19:00:00Z',
    ended_at: endedAt,
    changes_found: endedAt ? changesFound : null,
    source_check_collections: results.map((result) => ({ result })),
  };
}

describe('formatCheckTime (SRS-102.1)', () => {
  // Acceptance criterion: a check that ended 09/23/2026 at 2:00 PM ET is shown as "09/23/2026 2:00 PM ET".
  it('shows the date and time in the town time zone', () => {
    expect(formatCheckTime('2026-09-23T18:00:00Z', 'America/New_York')).toBe('09/23/2026 2:00 PM ET');
  });

  it('uses the town time zone, not the server time zone', () => {
    expect(formatCheckTime('2026-09-23T18:00:00Z', 'America/Los_Angeles')).toBe('09/23/2026 11:00 AM PT');
  });

  it('shows the morning with AM and keeps two-digit months and days', () => {
    expect(formatCheckTime('2026-01-05T14:05:00Z', 'America/New_York')).toBe('01/05/2026 9:05 AM ET');
  });
});

describe('isSuccessfulCheck (Definition 10)', () => {
  it('is successful when the check ended and no collection failed', () => {
    expect(isSuccessfulCheck(check(1, '2026-09-23T18:00:00Z', ['Complete', 'Unsupported']))).toBe(true);
  });

  it('is successful when the check ended with no collection rows', () => {
    expect(isSuccessfulCheck(check(1, '2026-09-23T18:00:00Z', []))).toBe(true);
  });

  it('is not successful when a collection failed', () => {
    expect(isSuccessfulCheck(check(1, '2026-09-23T18:00:00Z', ['Complete', 'Failed']))).toBe(false);
  });

  it('is not successful while the check is still running', () => {
    expect(isSuccessfulCheck(check(1, null))).toBe(false);
  });
});

describe('lastSuccessfulCheckAt (SRS-102.1)', () => {
  it('skips a newer failed check and returns the most recent successful one', () => {
    const checks = [
      check(3, '2026-09-23T21:00:00Z', ['Failed']),
      check(2, '2026-09-23T18:00:00Z'),
      check(1, '2026-09-23T15:00:00Z'),
    ];
    expect(lastSuccessfulCheckAt(checks)).toBe('2026-09-23T18:00:00Z');
  });

  it('returns null when no check was successful', () => {
    expect(lastSuccessfulCheckAt([check(1, '2026-09-23T18:00:00Z', ['Failed'])])).toBeNull();
    expect(lastSuccessfulCheckAt([])).toBeNull();
  });
});

describe('latestCheckFailed (SRS-102.2)', () => {
  it('is true when the most recent finished check has a failed collection', () => {
    expect(latestCheckFailed([check(2, '2026-09-23T21:00:00Z', ['Failed']), check(1, '2026-09-23T18:00:00Z')])).toBe(true);
  });

  it('is false when the most recent finished check was successful', () => {
    expect(latestCheckFailed([check(2, '2026-09-23T21:00:00Z'), check(1, '2026-09-23T18:00:00Z', ['Failed'])])).toBe(false);
  });

  it('is false when the town has no finished check yet', () => {
    expect(latestCheckFailed([])).toBe(false);
  });
});

describe('latestCheckFoundNothingNew (SRS-102.3)', () => {
  it('is true when the most recent finished check was successful and found nothing new', () => {
    expect(latestCheckFoundNothingNew([check(2, '2026-09-23T21:00:00Z', ['Complete'], false)])).toBe(true);
  });

  it('is false when the most recent finished check found new or changed records', () => {
    expect(latestCheckFoundNothingNew([check(2, '2026-09-23T21:00:00Z', ['Complete'], true)])).toBe(false);
  });

  it('is false when the most recent finished check failed', () => {
    expect(latestCheckFoundNothingNew([check(2, '2026-09-23T21:00:00Z', ['Failed'], false)])).toBe(false);
  });

  it('is false when only an older check found nothing new', () => {
    expect(
      latestCheckFoundNothingNew([
        check(2, '2026-09-23T21:00:00Z', ['Complete'], true),
        check(1, '2026-09-23T18:00:00Z', ['Complete'], false),
      ]),
    ).toBe(false);
  });

  it('is false when the town has no finished check yet', () => {
    expect(latestCheckFoundNothingNew([])).toBe(false);
  });
});