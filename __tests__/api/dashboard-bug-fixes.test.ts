// Tests for the dashboard bug fixes:
// #555 (SRS-501.1) every upcoming relevant meeting can be seen, not just six;
// #556 (SRS-501.5) "No matching meetings found." only when nothing matched;
// #562 (SRS-501.2) the start time reads "09/24/2026 7:00 PM ET".
import { createRequire } from 'node:module';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// @types/react-dom is not installed, so react-dom/server is loaded with only the one function used here.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

import { MeetingResults, type Meeting } from '../../app/(app)/dashboard/DashboardMeetings';
import { formatDashboardStart, upcomingMeetings } from '../../lib/dashboardMeetings';

beforeEach(() => {
  vi.stubGlobal('React', React);
});

function meeting(id: number, startAt: string, overrides: Partial<Meeting> = {}): Meeting {
  return {
    meeting_id: id,
    title: `Meeting ${id}`,
    start_at: startAt,
    is_canceled: false,
    town: 'Salem',
    meeting_time_zone: 'America/New_York',
    matched_topics: [],
    followed_directly: false,
    ...overrides,
  };
}

const render = (props: { meetings: Meeting[]; matchedCount?: number }) =>
  renderToStaticMarkup(React.createElement(MeetingResults, { failedTowns: [], ...props }));

describe('Dashboard item details (SRS-501.2, bug #562)', () => {
  it('shows a Salem City Council meeting on 09/24/2026 at 7:00 PM ET as "09/24/2026 7:00 PM ET"', () => {
    expect(formatDashboardStart('2026-09-24T23:00:00Z', 'America/New_York')).toBe('09/24/2026 7:00 PM ET');
  });

  it('keeps "ET" in winter, when the zone is on standard time', () => {
    expect(formatDashboardStart('2026-11-17T00:00:00Z', 'America/New_York')).toBe('11/16/2026 7:00 PM ET');
  });

  it("uses the town's own time zone", () => {
    expect(formatDashboardStart('2026-09-24T23:00:00Z', 'America/Chicago')).toBe('09/24/2026 6:00 PM CT');
  });

  it('gives null for a time it cannot read', () => {
    expect(formatDashboardStart('not a date', 'America/New_York')).toBeNull();
  });

  it('shows the title, the town and the new start time on the card', () => {
    const markup = render({ meetings: [meeting(1192, '2026-09-24T23:00:00Z', { title: 'Salem City Council' })] });

    expect(markup).toContain('Salem City Council');
    expect(markup).toContain('Town: Salem');
    expect(markup).toContain('09/24/2026 7:00 PM ET');
  });
});

describe('Relevant meetings display (SRS-501.1, bug #555)', () => {
  const NOW = new Date('2026-11-16T12:00:00Z');
  const eight = Array.from({ length: 8 }, (_, i) => meeting(i + 1, `2027-08-${String(i + 10)}T23:00:00Z`));

  it('keeps all 8 upcoming matches, so none is lost', () => {
    expect(upcomingMeetings(eight, NOW, Infinity)).toHaveLength(8);
  });

  it('shows the soonest 6 and a "Show all 8 upcoming meetings" button for the rest', () => {
    const markup = render({ meetings: eight });

    expect(markup.match(/href="\/meetings\/\d+"/g)).toHaveLength(6);
    expect(markup).toContain('Show all 8 upcoming meetings');
    expect(markup).toContain('aria-expanded="false"');
  });

  it('has no button when everything fits', () => {
    expect(render({ meetings: eight.slice(0, 6) })).not.toContain('Show all');
  });
});

describe('Empty dashboard message (SRS-501.5, bug #556)', () => {
  it('does not say "No matching meetings found." when 41 meetings matched but all are in the past', () => {
    const markup = render({ meetings: [], matchedCount: 41 });

    expect(markup).not.toContain('No matching meetings found.');
    expect(markup).not.toContain('Choose towns and topics');
    expect(markup).toContain('No upcoming meetings.');
    expect(markup).toContain('All 41 of your matching meetings have');
    expect(markup).toContain('href="/meetings"');
  });

  it('still says "No matching meetings found." when nothing matched', () => {
    const markup = render({ meetings: [], matchedCount: 0 });

    expect(markup).toContain('No matching meetings found.');
    expect(markup).not.toContain('No upcoming meetings.');
  });
});
