import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Meeting, MeetingTown, MeetingsListState } from '../../app/(app)/meetings/useMeetingsList';
import type { MeetingTimeList } from '../../app/(app)/meetings/meetingsByDate';

// SRS-220.11, MS, Upcoming and past meetings: "Upcoming meetings" and "Past
// meetings" buttons above the meeting list on the meetings page; upcoming is
// today or later, soonest first; past is before today, most recent first.

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

// The page gets its data only through useMeetingsList, so the hook is replaced.
const hook = vi.hoisted(() => ({ state: { status: 'loading' } as MeetingsListState }));
vi.mock('../../app/(app)/meetings/useMeetingsList', () => ({ useMeetingsList: () => hook.state }));

// The selected list is replaced by whatever a test sets; null means the real hook.
const listChoice = vi.hoisted(() => ({ selected: null as null | MeetingTimeList }));
vi.mock('../../app/(app)/meetings/useMeetingTimeList', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/(app)/meetings/useMeetingTimeList')>();
  return {
    useMeetingTimeList: () => (listChoice.selected ? [listChoice.selected, vi.fn()] : actual.useMeetingTimeList()),
  };
});

import MeetingsPage from '../../app/(app)/meetings/page';
import MeetingTimeToggle, {
  BUTTON_COLORS,
  BUTTON_SIZE,
  COUNT_COLORS,
  COUNT_SIZE,
  MEETING_TIME_LABELS,
} from '../../app/(app)/meetings/MeetingTimeToggle';
import { useMeetingTimeList } from '../../app/(app)/meetings/useMeetingTimeList';
import { calendarDate, splitMeetingsByDate } from '../../app/(app)/meetings/meetingsByDate';

const EASTERN = 'America/New_York';
const SALEM: MeetingTown = { town_id: 1, name: 'Salem', meeting_time_zone: EASTERN };
const BROOKLINE: MeetingTown = { town_id: 10, name: 'Brookline', meeting_time_zone: EASTERN };
// Monday 11/16/2026 at 10:00 AM Eastern (EST, UTC-5).
const NOW = new Date('2026-11-16T15:00:00Z');
const zoneOf = () => EASTERN;

function meeting(id: number, startAt: string | null, townId = SALEM.town_id): Meeting {
  return {
    meeting_id: id, town_id: townId, title: `Meeting ${id}`, source_body_name: 'City Council', source_start_time: startAt,
    start_at: startAt, location: null, online_link: null, source_url: null, document_count: 0,
  };
}

// The SRS-220.11 example: 7:00 PM Eastern meetings on 11/10, 11/18 and 12/07/2026.
const NOV_10 = meeting(10, '2026-11-11T00:00:00Z');
const NOV_18 = meeting(18, '2026-11-19T00:00:00Z');
const DEC_07 = meeting(7, '2026-12-08T00:00:00Z');

const ids = (meetings: { meeting_id: number }[]) => meetings.map((entry) => entry.meeting_id);

function render(meetings: Meeting[], selected: MeetingTimeList | null, followedTownIds = [SALEM.town_id, BROOKLINE.town_id]): string {
  vi.stubGlobal('React', React);
  hook.state = { status: 'loaded', towns: [SALEM, BROOKLINE], meetings, followedTownIds };
  listChoice.selected = selected;
  return renderToStaticMarkup(React.createElement(MeetingsPage));
}

// The page renders both lists and hides the one not selected; this is the part
// of the markup for the list that is showing.
function shown(markup: string): string {
  const parts = markup.split(/(?=<div data-meeting-list=")/);
  const lists = parts.filter((part) => part.startsWith('<div data-meeting-list='));
  const visible = lists.filter((part) => !/^<div data-meeting-list="[a-z]+" hidden=""/.test(part));
  expect(lists).toHaveLength(2);
  expect(visible).toHaveLength(1);
  return parts[0] + visible[0];
}
const listedIds = (markup: string) => Array.from(shown(markup).matchAll(/href="\/meetings\/(\d+)"/g), ([, id]) => Number(id));
const textOf = (markup: string) => shown(markup).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
const allTextOf = (markup: string) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  listChoice.selected = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('splitMeetingsByDate (SRS-220.11)', () => {
  it('puts the SRS-220.11 example in Upcoming 11/18 then 12/07, and Past 11/10', () => {
    const lists = splitMeetingsByDate([DEC_07, NOV_10, NOV_18], zoneOf, NOW);
    expect(ids(lists.upcoming)).toEqual([18, 7]);
    expect(ids(lists.past)).toEqual([10]);
  });

  it('lists upcoming soonest first and past most recent first', () => {
    // Shuffled, the way the API's newest-first order would not give either list.
    const lists = splitMeetingsByDate(
      [meeting(1, '2027-08-31T21:30:00Z'), meeting(2, '2026-10-01T23:00:00Z'), meeting(3, '2026-11-20T00:00:00Z'), meeting(4, '2026-11-13T00:00:00Z')],
      zoneOf,
      NOW,
    );
    expect(ids(lists.upcoming)).toEqual([3, 1]);
    expect(ids(lists.past)).toEqual([4, 2]);
  });

  it("treats a meeting dated today in its town's zone as upcoming, even if it already started", () => {
    // 8:00 AM Eastern today, two hours before NOW.
    expect(ids(splitMeetingsByDate([meeting(1, '2026-11-16T13:00:00Z')], zoneOf, NOW).upcoming)).toEqual([1]);
  });

  it("uses the town's date, not the UTC date, on both sides of midnight", () => {
    // 11:30 PM Eastern on 11/15 is already 11/16 in UTC, but it was yesterday in the town.
    expect(ids(splitMeetingsByDate([meeting(1, '2026-11-16T04:30:00Z')], zoneOf, NOW).past)).toEqual([1]);
    // 8:00 PM Eastern tonight is 11/17 in UTC, still today in the town.
    expect(ids(splitMeetingsByDate([meeting(2, '2026-11-17T01:00:00Z')], zoneOf, NOW).upcoming)).toEqual([2]);
    expect(calendarDate(new Date('2026-11-16T04:30:00Z'), EASTERN)).toBe('2026-11-15');
  });

  it('asks for each meeting\'s own town zone', () => {
    const zones = vi.fn((townId: number) => (townId === BROOKLINE.town_id ? 'Pacific/Honolulu' : EASTERN));
    // 4:30 AM UTC on 11/16 is 11/15 in Eastern but still 11/15 6:30 PM in Honolulu too; 11:00 UTC is 11/16 1:00 AM in Honolulu.
    const lists = splitMeetingsByDate([meeting(1, '2026-11-16T11:00:00Z', BROOKLINE.town_id)], zones, NOW);
    expect(zones).toHaveBeenCalledWith(BROOKLINE.town_id);
    expect(ids(lists.upcoming)).toEqual([1]);
  });

  it('puts meetings with no or an unreadable start time at the end of Past', () => {
    const lists = splitMeetingsByDate([meeting(1, null), NOV_10, meeting(2, 'not a date'), NOV_18], zoneOf, NOW);
    expect(ids(lists.upcoming)).toEqual([18]);
    expect(ids(lists.past)).toEqual([10, 1, 2]);
  });

  it('falls back to Eastern time for a missing or unknown zone', () => {
    const lists = splitMeetingsByDate([meeting(1, '2026-11-16T04:30:00Z'), meeting(2, '2026-11-16T04:30:00Z')], (townId) => (townId ? undefined : 'Not/A_Zone'), NOW);
    expect(ids(lists.past)).toEqual([1, 2]);
    expect(calendarDate(new Date('2026-11-16T04:30:00Z'), 'Not/A_Zone')).toBe('2026-11-15');
  });

  it('returns new arrays and leaves the input as it was', () => {
    const input = [DEC_07, NOV_10, NOV_18];
    splitMeetingsByDate(input, zoneOf, NOW);
    expect(ids(input)).toEqual([7, 10, 18]);
  });
});

describe('Meetings page: Upcoming meetings and Past meetings (SRS-220.11)', () => {
  it('selects Upcoming meetings when the page loads (the real hook)', () => {
    vi.stubGlobal('React', React);
    let initial: MeetingTimeList | undefined;
    function Probe() {
      [initial] = useMeetingTimeList();
      return null;
    }
    renderToStaticMarkup(React.createElement(Probe));
    expect(initial).toBe('upcoming');

    const markup = render([DEC_07, NOV_10, NOV_18], null);
    expect(markup).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Upcoming meetings/);
    expect(markup).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Past meetings/);
  });

  it('lists the 11/18/2026 meeting above the 12/07/2026 one, with no 11/10/2026 meeting, under Upcoming meetings', () => {
    const markup = render([DEC_07, NOV_10, NOV_18], 'upcoming');
    expect(listedIds(markup)).toEqual([18, 7]);
    expect(textOf(markup)).toContain('Soonest first');
    expect(textOf(markup)).not.toContain('Newest meeting first');
  });

  it('lists only the 11/10/2026 meeting under Past meetings', () => {
    const markup = render([DEC_07, NOV_10, NOV_18], 'past');
    expect(listedIds(markup)).toEqual([10]);
    expect(textOf(markup)).toContain('Most recent first');
  });

  it('shows the selected list in the count line', () => {
    expect(textOf(render([DEC_07, NOV_10, NOV_18], 'upcoming'))).toMatch(/All my towns · 2 meetings/);
    expect(textOf(render([DEC_07, NOV_10, NOV_18], 'past'))).toMatch(/All my towns · 1 meeting\b/);
  });

  it('renders both lists once and hides the one not selected, so switching does not rebuild rows', () => {
    const markup = render([DEC_07, NOV_10, NOV_18], 'upcoming');
    expect(markup).toMatch(/<div data-meeting-list="upcoming">/);
    expect(markup).toMatch(/<div data-meeting-list="past" hidden="">/);
    expect(Array.from(markup.matchAll(/href="\/meetings\/(\d+)"/g), ([, id]) => Number(id))).toEqual([18, 7, 10]);
  });

  it('puts the buttons under the town filter and above the list', () => {
    const markup = render([DEC_07, NOV_10, NOV_18], 'upcoming');
    const buttons = markup.indexOf('Upcoming meetings');
    expect(buttons).toBeGreaterThan(markup.indexOf('<select'));
    expect(buttons).toBeLessThan(markup.indexOf('<ul'));
  });

  it('says "No upcoming meetings for your towns." when only past meetings are stored', () => {
    const text = textOf(render([NOV_10], 'upcoming'));
    expect(text).toContain('No upcoming meetings for your towns.');
    expect(text).not.toContain('No meetings are stored for your towns yet.');
  });

  it('says "No past meetings for your towns." when only upcoming meetings are stored', () => {
    expect(textOf(render([NOV_18], 'past'))).toContain('No past meetings for your towns.');
  });

  it('keeps the earlier messages first: no followed towns, and no stored meetings', () => {
    const noTowns = allTextOf(render([NOV_18], 'upcoming', []));
    expect(noTowns).toContain('Choose your towns in Preferences.');
    expect(noTowns).not.toContain('Upcoming meetings');

    const noMeetings = textOf(render([], 'upcoming'));
    expect(noMeetings).toContain('No meetings are stored for your towns yet.');
    expect(noMeetings).not.toContain('No upcoming meetings for your towns.');
  });
});

describe('MeetingTimeToggle (SRS-220.11)', () => {
  function toggle(selected: MeetingTimeList) {
    vi.stubGlobal('React', React);
    return renderToStaticMarkup(
      React.createElement(MeetingTimeToggle, { selected, counts: { upcoming: 27, past: 267 }, onSelect: vi.fn() }),
    );
  }
  const buttonClasses = (markup: string) => Array.from(markup.matchAll(/<button\b[^>]*class="([^"]*)"/g), ([, c]) => c);
  const countClasses = (markup: string) => Array.from(markup.matchAll(/<span class="([^"]*)">\d+<\/span>/g), ([, c]) => c);

  it('has the exact labels, in order, each with its count', () => {
    expect(MEETING_TIME_LABELS).toEqual({ upcoming: 'Upcoming meetings', past: 'Past meetings' });
    expect(allTextOf(toggle('upcoming'))).toMatch(/Upcoming meetings 27 Past meetings 267/);
  });

  it('marks only the selected button as pressed', () => {
    const markup = toggle('past');
    expect(Array.from(markup.matchAll(/aria-pressed="true"/g))).toHaveLength(1);
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Past meetings/);
  });

  it('gives both buttons the same size classes whichever is selected, so selecting changes only colors', () => {
    for (const selected of ['upcoming', 'past'] as MeetingTimeList[]) {
      const buttons = buttonClasses(toggle(selected));
      expect(buttons).toHaveLength(2);
      for (const classes of buttons) {
        expect(classes.startsWith(BUTTON_SIZE)).toBe(true);
        expect(classes.slice(BUTTON_SIZE.length).trim()).toMatch(new RegExp(`^(${BUTTON_COLORS.selected}|${BUTTON_COLORS.unselected})$`.replace(/[/.]/g, '\\$&')));
      }
      for (const classes of countClasses(toggle(selected))) {
        expect(classes.startsWith(COUNT_SIZE)).toBe(true);
      }
    }
    // The color sets hold no size, spacing, border-width or font-weight classes.
    for (const colors of [BUTTON_COLORS.selected, BUTTON_COLORS.unselected, COUNT_COLORS.selected, COUNT_COLORS.unselected]) {
      expect(colors).not.toMatch(/\b(w-|h-|min-|max-|p[xy]?-|m[xy]?-|text-(xs|sm|base|lg)|font-|border-\d|rounded)/);
    }
  });

  it('uses two equal grid columns and rounded rectangles, not pills', () => {
    const markup = toggle('upcoming');
    expect(markup).toMatch(/role="group"[^>]*class="[^"]*grid-cols-2/);
    expect(BUTTON_SIZE).toContain('w-full');
    expect(BUTTON_SIZE).toContain('rounded-lg');
    expect(BUTTON_SIZE).not.toContain('rounded-full');
  });

  it('reports the list the user selects', () => {
    vi.stubGlobal('React', React);
    const onSelect = vi.fn();
    const group = MeetingTimeToggle({ selected: 'upcoming', counts: { upcoming: 1, past: 1 }, onSelect }) as React.ReactElement<{
      children: React.ReactElement<{ onClick: () => void }>[];
    }>;
    group.props.children[1].props.onClick();
    expect(onSelect).toHaveBeenCalledWith('past');
  });
});
