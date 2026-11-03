// Tests for removing repeated dates from names in the extraction list (Fix: names without dates).
// The meeting heading already shows the date, so dates inside document and meeting
// names are removed. Examples are real titles from Salem and Brookline.
import { describe, expect, it } from 'vitest';
import { withoutDates } from '../../lib/extractions';

describe('withoutDates', () => {
  it.each([
    ['Joint Public Hearing with the Planning Board Monday October 19, 2026', 'Joint Public Hearing with the Planning Board'],
    ['Salem City Council Regular Meeting October 22, 2026', 'Salem City Council Regular Meeting'],
    ['City Council Agenda Packet, June 25, 2026', 'City Council Agenda Packet'],
    ['Park and Recreation Commission Meeting 10.27.26', 'Park and Recreation Commission Meeting'],
    ['Conservation Commission Outdoor Lighting Public Hearing Agenda 10.26.2026', 'Conservation Commission Outdoor Lighting Public Hearing Agenda'],
    ['PCAC Meeting 10/26/2026', 'PCAC Meeting'],
    ['2026 10 21 Capital Subcommittee Continuation Hearing', 'Capital Subcommittee Continuation Hearing'],
    ['Salem City Council Regular Meeting September 10, 2026 - Minutes', 'Salem City Council Regular Meeting - Minutes'],
  ])('removes the date from %j', (name, expected) => {
    expect(withoutDates(name)).toBe(expected);
  });

  it("keeps the town's own version markers", () => {
    expect(withoutDates('Agenda 10.22.2026 - 1')).toBe('Agenda - 1');
    expect(withoutDates('Agenda Packet February 27, 2025 II')).toBe('Agenda Packet II');
    expect(withoutDates('City Council Regular Meeting, February 13, 2025 - Rev 2 to fix public testimony sign in issue'))
      .toBe('City Council Regular Meeting - Rev 2 to fix public testimony sign in issue');
  });

  it('leaves names without a date alone, and never returns an empty name', () => {
    expect(withoutDates('Agenda V2')).toBe('Agenda V2');
    expect(withoutDates('October 19, 2026')).toBe('October 19, 2026');
  });
});
