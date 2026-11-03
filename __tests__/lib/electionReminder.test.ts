// Tests for the landing page Election Day reminder (Massachusetts, November 3, 2026).
import { describe, expect, it } from 'vitest';
import { electionReminder, localDate } from '../../lib/electionReminder';

// Times are in UTC; Massachusetts is UTC-5 in early November.
const at = (iso: string) => new Date(iso);

describe('electionReminder', () => {
  it('says "tomorrow" the day before Election Day', () => {
    const r = electionReminder(at('2026-11-02T15:00:00Z'));
    expect(r?.headline).toBe('Election Day is tomorrow, Tuesday, November 3.');
    expect(r?.detail).toBe('Polls are open 7 a.m. to 8 p.m.');
    expect(r?.url).toBe('https://www.sec.state.ma.us/divisions/elections/elections-and-voting.htm');
  });

  it('says "today" on Election Day, until midnight in Massachusetts', () => {
    expect(electionReminder(at('2026-11-03T05:00:00Z'))?.headline).toBe('Today is Election Day in Massachusetts.'); // 12:00 a.m. ET
    expect(electionReminder(at('2026-11-04T04:59:00Z'))?.headline).toBe('Today is Election Day in Massachusetts.'); // 11:59 p.m. ET
  });

  it('is gone the day after Election Day', () => {
    expect(electionReminder(at('2026-11-04T05:00:00Z'))).toBeNull(); // 12:00 a.m. ET Nov 4
  });

  it('starts a week before and not earlier', () => {
    expect(electionReminder(at('2026-10-27T15:00:00Z'))?.headline).toBe('Election Day is Tuesday, November 3.');
    expect(electionReminder(at('2026-10-26T15:00:00Z'))).toBeNull();
  });

  it('uses the Massachusetts date, not the visitor\'s UTC date', () => {
    // 11 p.m. ET on Nov 2 is already Nov 3 in UTC, but it is still the day before.
    expect(localDate(at('2026-11-03T04:00:00Z'), 'America/New_York')).toBe('2026-11-02');
    expect(electionReminder(at('2026-11-03T04:00:00Z'))?.daysAway).toBe(1);
  });
});
