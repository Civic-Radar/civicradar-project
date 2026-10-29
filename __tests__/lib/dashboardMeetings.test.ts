import { describe, expect, it } from 'vitest';
import { upcomingMeetings } from '../../lib/dashboardMeetings';

const NOW = new Date('2026-10-27T12:00:00Z');

function meeting(meeting_id: number, start_at: string | null) {
  return { meeting_id, start_at };
}

const ids = (meetings: { meeting_id: number }[]) => meetings.map((m) => m.meeting_id);

describe('Dashboard upcoming meetings (SRS-501.1)', () => {
  it('keeps two Salem matches and a directly followed Brookline meeting', () => {
    const matches = [
      meeting(1, '2026-10-28T23:00:00Z'), // Salem, matched
      meeting(2, '2026-10-29T23:00:00Z'), // Brookline, followed directly
      meeting(3, '2026-11-02T23:00:00Z'), // Salem, matched
    ];
    expect(ids(upcomingMeetings(matches, NOW))).toEqual([1, 2, 3]);
  });

  it('leaves out meetings that already started', () => {
    const matches = [meeting(1, '2026-10-20T23:00:00Z'), meeting(2, '2026-10-28T23:00:00Z')];
    expect(ids(upcomingMeetings(matches, NOW))).toEqual([2]);
  });

  it('keeps a meeting that starts right now', () => {
    expect(ids(upcomingMeetings([meeting(1, NOW.toISOString())], NOW))).toEqual([1]);
  });

  it('leaves out meetings without a start time', () => {
    const matches = [meeting(1, null), meeting(2, '2026-10-28T23:00:00Z')];
    expect(ids(upcomingMeetings(matches, NOW))).toEqual([2]);
  });

  it('shows at most six, the soonest first', () => {
    const matches = Array.from({ length: 8 }, (_, i) => meeting(i + 1, `2026-11-0${i + 1}T23:00:00Z`));
    expect(ids(upcomingMeetings(matches, NOW))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('returns an empty list when nothing is upcoming', () => {
    expect(upcomingMeetings([meeting(1, '2026-10-01T23:00:00Z')], NOW)).toEqual([]);
  });
});
