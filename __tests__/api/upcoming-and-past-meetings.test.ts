import { createRequire } from 'node:module';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentListEntry, DocumentsState } from '../../app/(app)/documents/useDocuments';
import type { TitleSearch as TitleSearchHook } from '../../app/(app)/documents/useTitleSearch';
import type { MeetingList } from '../../lib/meetingTimeline';

// SRS-209.4, MS, Upcoming and past meetings: "Upcoming meetings" and "Past
// meetings" buttons above the document list; upcoming is today or later,
// soonest first; past is before today, most recent first (replaces SRS-209.1,
// defect #516).

const hook = vi.hoisted(() => ({ state: { status: 'loading' } as DocumentsState }));
vi.mock('../../app/(app)/documents/useDocuments', () => ({ useDocuments: () => hook.state }));

const search = vi.hoisted(() => ({ state: null as null | TitleSearchHook }));
vi.mock('../../app/(app)/documents/useTitleSearch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/(app)/documents/useTitleSearch')>();
  return { ...actual, useTitleSearch: () => search.state ?? { ...actual.INITIAL_TITLE_SEARCH, type: vi.fn(), submit: vi.fn(), clear: vi.fn() } };
});

// The selected list is replaced by whatever a test sets; null means the real hook.
const listChoice = vi.hoisted(() => ({ selected: null as null | MeetingList, select: null as null | ((list: MeetingList) => void) }));
vi.mock('../../app/(app)/documents/useMeetingList', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/(app)/documents/useMeetingList')>();
  return {
    useMeetingList: () => (listChoice.selected ? [listChoice.selected, listChoice.select ?? vi.fn()] : actual.useMeetingList()),
  };
});

import DocumentsPage from '../../app/(app)/documents/page';
import MeetingListToggle, { MEETING_LIST_LABELS } from '../../app/(app)/documents/MeetingListToggle';
import { useMeetingList } from '../../app/(app)/documents/useMeetingList';
import {
  EMPTY_LIST_MESSAGE,
  NO_PAST_MESSAGE,
  NO_RESULTS_MESSAGE,
  NO_UPCOMING_MESSAGE,
} from '../../app/(app)/documents/documentsMessages';
import { calendarDate, splitByMeetingDate } from '../../lib/meetingTimeline';

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

const EASTERN = 'America/New_York';
// Monday 11/16/2026 at 10:00 AM Eastern (EST, UTC-5).
const NOW = new Date('2026-11-16T15:00:00Z');

// A document whose meeting starts at the given UTC instant.
function doc(id: number, meetingStartAt: string | null, timeZone: string | null = EASTERN): DocumentListEntry {
  return {
    document_id: id, title: `Document ${id}`, town_id: 1, meeting_id: 100 + id, retrieved_at: '2026-11-01T12:00:00+00:00',
    summary_status: 'Complete', document_type: 'Agenda', town_name: 'Salem', meeting_start_at: meetingStartAt,
    meeting_time_zone: timeZone,
  };
}

// The SRS-209.4 example: 7:00 PM Eastern meetings on 11/10, 11/18 and 12/07/2026.
const NOV_10 = doc(10, '2026-11-11T00:00:00Z');
const NOV_18 = doc(18, '2026-11-19T00:00:00Z');
const DEC_07 = doc(7, '2026-12-08T00:00:00Z');

const ids = (documents: { document_id: number }[]) => documents.map((entry) => entry.document_id);

function render(documents: DocumentListEntry[], selected: MeetingList | null, submittedTerm = ''): string {
  vi.stubGlobal('React', React);
  hook.state = { status: 'loaded', documents, followsTowns: true };
  search.state = { query: submittedTerm, submittedTerm, type: vi.fn(), submit: vi.fn(), clear: vi.fn() };
  listChoice.selected = selected;
  return renderToStaticMarkup(React.createElement(DocumentsPage));
}

const listedIds = (markup: string) =>
  Array.from(markup.matchAll(/<li\b[\s\S]*?href="\/documents\/(\d+)"/g), ([, id]) => Number(id));
const textOf = (markup: string) => markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  listChoice.selected = null;
  listChoice.select = null;
  search.state = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('splitByMeetingDate (SRS-209.4)', () => {
  it('puts the SRS-209.4 example in Upcoming 11/18 then 12/07, and Past 11/10', () => {
    const lists = splitByMeetingDate([DEC_07, NOV_10, NOV_18], NOW);
    expect(ids(lists.upcoming)).toEqual([18, 7]);
    expect(ids(lists.past)).toEqual([10]);
  });

  it('lists upcoming soonest first and past most recent first', () => {
    const lists = splitByMeetingDate(
      [doc(1, '2026-10-01T23:00:00Z'), doc(2, '2027-01-05T00:00:00Z'), doc(3, '2026-11-01T23:00:00Z'), doc(4, '2026-11-20T00:00:00Z')],
      NOW,
    );
    expect(ids(lists.upcoming)).toEqual([4, 2]);
    expect(ids(lists.past)).toEqual([3, 1]);
  });

  it("treats a meeting dated today in the town's zone as upcoming, even if it already started", () => {
    // 8:00 AM Eastern today, two hours before NOW.
    expect(ids(splitByMeetingDate([doc(1, '2026-11-16T13:00:00Z')], NOW).upcoming)).toEqual([1]);
  });

  it("uses the town's date, not the UTC date, on both sides of midnight", () => {
    // 11:30 PM Eastern on 11/15 is already 11/16 in UTC, but it was yesterday in the town.
    expect(ids(splitByMeetingDate([doc(1, '2026-11-16T04:30:00Z')], NOW).past)).toEqual([1]);
    // 8:00 PM Eastern tonight is 11/17 in UTC, still today in the town.
    expect(ids(splitByMeetingDate([doc(2, '2026-11-17T01:00:00Z')], NOW).upcoming)).toEqual([2]);
    expect(calendarDate(new Date('2026-11-16T04:30:00Z'), EASTERN)).toBe('2026-11-15');
  });

  it('keeps documents of the same meeting in their incoming order (newest retrieved first)', () => {
    const lists = splitByMeetingDate(
      [doc(1, '2026-11-19T00:00:00Z'), doc(2, '2026-11-19T00:00:00Z'), doc(3, '2026-11-11T00:00:00Z'), doc(4, '2026-11-11T00:00:00Z')],
      NOW,
    );
    expect(ids(lists.upcoming)).toEqual([1, 2]);
    expect(ids(lists.past)).toEqual([3, 4]);
  });

  it('puts documents with no or an unreadable meeting date at the end of Past (SRS-209.3)', () => {
    const lists = splitByMeetingDate([doc(1, null), NOV_10, doc(2, 'not a date'), NOV_18], NOW);
    expect(ids(lists.upcoming)).toEqual([18]);
    expect(ids(lists.past)).toEqual([10, 1, 2]);
  });

  it('falls back to Eastern time for a missing or unknown zone', () => {
    const lists = splitByMeetingDate([doc(1, '2026-11-16T04:30:00Z', null), doc(2, '2026-11-16T04:30:00Z', 'Not/A_Zone')], NOW);
    expect(ids(lists.past)).toEqual([1, 2]);
  });

  it('returns new arrays and leaves the input as it was', () => {
    const input = [DEC_07, NOV_10, NOV_18];
    splitByMeetingDate(input, NOW);
    expect(ids(input)).toEqual([7, 10, 18]);
  });
});

describe('Documents page: Upcoming meetings and Past meetings (SRS-209.4)', () => {
  it('selects Upcoming meetings when the page loads (the real hook)', () => {
    vi.stubGlobal('React', React);
    let initial: MeetingList | undefined;
    function Probe() {
      [initial] = useMeetingList();
      return null;
    }
    renderToStaticMarkup(React.createElement(Probe));
    expect(initial).toBe('upcoming');

    const markup = render([DEC_07, NOV_10, NOV_18], null);
    expect(markup).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Upcoming meetings/);
    expect(markup).toMatch(/<button[^>]*aria-pressed="false"[^>]*>Past meetings/);
  });

  it('shows the 11/18/2026 document above the 12/07/2026 one, and not the 11/10/2026 one, under Upcoming meetings', () => {
    const markup = render([DEC_07, NOV_10, NOV_18], 'upcoming');
    expect(listedIds(markup)).toEqual([18, 7]);
    expect(textOf(markup)).toContain('Soonest first');
  });

  it('shows only the 11/10/2026 document under Past meetings', () => {
    const markup = render([DEC_07, NOV_10, NOV_18], 'past');
    expect(listedIds(markup)).toEqual([10]);
    expect(textOf(markup)).toContain('Most recent first');
  });

  it('puts the buttons above the count and the list', () => {
    const markup = render([DEC_07, NOV_10, NOV_18], 'upcoming');
    const buttons = markup.indexOf('Upcoming meetings');
    expect(buttons).toBeGreaterThan(-1);
    expect(buttons).toBeLessThan(markup.indexOf('2 documents'));
    expect(buttons).toBeLessThan(markup.indexOf('<li'));
  });

  it('shows "No upcoming meetings to show." when only past documents match', () => {
    const markup = render([NOV_10], 'upcoming');
    expect(textOf(markup)).toContain(NO_UPCOMING_MESSAGE);
    expect(listedIds(markup)).toEqual([]);
    expect(NO_UPCOMING_MESSAGE).toBe('No upcoming meetings to show.');
  });

  it('shows "No past meetings to show." when only upcoming documents match', () => {
    const markup = render([NOV_18], 'past');
    expect(textOf(markup)).toContain(NO_PAST_MESSAGE);
    expect(NO_PAST_MESSAGE).toBe('No past meetings to show.');
  });

  it('keeps the empty-scope and no-results messages ahead of the list messages', () => {
    const empty = textOf(render([], 'upcoming'));
    expect(empty).toContain(EMPTY_LIST_MESSAGE);
    expect(empty).not.toContain(NO_UPCOMING_MESSAGE);

    const noResults = textOf(render([NOV_10, NOV_18], 'upcoming', 'zoning'));
    expect(noResults).toContain(NO_RESULTS_MESSAGE);
    expect(noResults).not.toContain(NO_UPCOMING_MESSAGE);
  });

  it('applies the title search before the selected list', () => {
    const planning = { ...NOV_10, title: 'Planning Board Agenda' };
    const markup = render([planning, NOV_18], 'upcoming', 'planning');
    // The only match is a past meeting, so Upcoming is empty and Past counts it.
    expect(textOf(markup)).toContain(NO_UPCOMING_MESSAGE);
    expect(markup).toMatch(/Past meetings<span[^>]*>1<\/span>/);
  });
});

describe('MeetingListToggle (SRS-209.4)', () => {
  function toggle(selected: MeetingList, onSelect = vi.fn()) {
    vi.stubGlobal('React', React);
    return { onSelect, markup: renderToStaticMarkup(React.createElement(MeetingListToggle, { selected, counts: { upcoming: 5, past: 289 }, onSelect })) };
  }

  it('has the exact labels, in order, each with its count', () => {
    expect(MEETING_LIST_LABELS).toEqual({ upcoming: 'Upcoming meetings', past: 'Past meetings' });
    const text = textOf(toggle('upcoming').markup);
    expect(text).toMatch(/Upcoming meetings 5 Past meetings 289/);
  });

  it('marks only the selected button as pressed', () => {
    const { markup } = toggle('past');
    expect(Array.from(markup.matchAll(/aria-pressed="true"/g))).toHaveLength(1);
    expect(markup).toMatch(/aria-pressed="true"[^>]*>Past meetings/);
  });

  it('is two rounded rectangular buttons', () => {
    const { markup } = toggle('upcoming');
    const buttons = Array.from(markup.matchAll(/<button\b[^>]*class="([^"]*)"/g), ([, classes]) => classes);
    expect(buttons).toHaveLength(2);
    for (const classes of buttons) {
      expect(classes).toContain('rounded-lg');
      expect(classes).not.toContain('rounded-full');
    }
  });

  it('reports the list the user selects', () => {
    vi.stubGlobal('React', React);
    const onSelect = vi.fn();
    const group = MeetingListToggle({ selected: 'upcoming', counts: { upcoming: 1, past: 1 }, onSelect }) as React.ReactElement<{ children: React.ReactElement<{ onClick: () => void }>[] }>;
    group.props.children[1].props.onClick();
    expect(onSelect).toHaveBeenCalledWith('past');
  });
});
