// Tests for issue #512 (SRS-401.5): the dashboard meeting card shows the agenda
// passage that produced each matched topic, not only the topic name.
import { createRequire } from 'node:module';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// @types/react-dom is not installed, so react-dom/server is loaded with only the one function used here.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

import { MeetingResults, type Meeting } from '../../app/(app)/dashboard/DashboardMeetings';

// The components don't import React; Vitest compiles their JSX to React.createElement.
beforeEach(() => {
  vi.stubGlobal('React', React);
});

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    meeting_id: 1192,
    title: 'Salem City Council',
    start_at: '2026-12-10T23:00:00Z',
    is_canceled: false,
    town: 'Salem',
    meeting_time_zone: 'America/New_York',
    matched_topics: [],
    followed_directly: false,
    ...overrides,
  };
}

const render = (meetings: Meeting[]) => renderToStaticMarkup(React.createElement(MeetingResults, { meetings, failedTowns: [] }));

// The "why it matched" block on a card: its passage (topic, text, hover title)
// and the "+N more" line, if any.
function reason(markup: string): { topic: string; text: string; title: string; more: string | null } | null {
  const block = markup.match(/<div\b[^>]*aria-label="Why this meeting matched"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  if (block === undefined) return null;
  const passage = block.match(/<p\b[^>]*title="([^"]*)"[^>]*><span[^>]*>([^<]*)<\/span>([\s\S]*?)<\/p>/);
  const more = block.match(/<p\b(?![^>]*title=)[^>]*>([\s\S]*?)<\/p>/);
  const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]*>/g, '').trim();
  return passage
    ? { title: passage[1], topic: passage[2], text: text(passage[3]), more: more ? text(more[1]) : null }
    : null;
}

describe('Agenda passage on the dashboard card (#512)', () => {
  it('shows the town, the Housing tag and the agenda passage that produced it', () => {
    const markup = render([
      meeting({ matched_topics: [{ topic: 'Housing', evidence_text: 'Affordable housing at 10 Main St.' }] }),
    ]);

    expect(markup).toContain('Town: Salem');
    expect(markup).toMatch(/<span[^>]*>Housing<\/span>/);
    expect(reason(markup)).toEqual({
      topic: 'Housing:', text: 'Affordable housing at 10 Main St.', title: 'Affordable housing at 10 Main St.', more: null,
    });
  });

  it('shows the first topic\'s passage and how many more topics matched', () => {
    const markup = render([
      meeting({
        matched_topics: [
          { topic: 'Housing', evidence_text: 'Vote on the housing production plan.' },
          { topic: 'Transportation & Parking', evidence_text: 'Resident parking permit fees.' },
          { topic: 'Zoning & Land Use', evidence_text: 'Accessory dwelling units.' },
        ],
      }),
    ]);

    expect(reason(markup)).toMatchObject({ topic: 'Housing:', text: 'Vote on the housing production plan.', more: '+2 more topics' });
    expect(markup).not.toContain('Resident parking permit fees.');
    expect(markup).not.toContain('Accessory dwelling units.');
  });

  it('says "topic" for one more', () => {
    const markup = render([
      meeting({
        matched_topics: [
          { topic: 'Housing', evidence_text: 'Vote on the housing production plan.' },
          { topic: 'Transportation & Parking', evidence_text: 'Resident parking permit fees.' },
        ],
      }),
    ]);

    expect(reason(markup)?.more).toBe('+1 more topic');
  });

  it('keeps a long passage to two lines on the card, with the whole text available on hover', () => {
    const long = `…${'review of the affordable housing contribution '.repeat(4).trim()}…`;
    const markup = render([meeting({ matched_topics: [{ topic: 'Housing', evidence_text: long }] })]);

    expect(markup).toMatch(/<p\b[^>]*class="[^"]*line-clamp-2[^"]*"/);
    expect(reason(markup)).toMatchObject({ title: long, text: long });
  });

  it('shows no passage on a card with no matched topics', () => {
    const markup = render([meeting({ followed_directly: true })]);

    expect(markup).toContain('Followed');
    expect(markup).not.toContain('Why this meeting matched');
  });

  it("keeps each card's passage on its own card", () => {
    const markup = render([
      meeting({ meeting_id: 1, title: 'First', matched_topics: [{ topic: 'Housing', evidence_text: 'First passage.' }] }),
      meeting({ meeting_id: 2, title: 'Second', matched_topics: [] }),
    ]);
    const second = markup.slice(markup.indexOf('href="/meetings/2"'));

    expect(markup.match(/Why this meeting matched/g)).toHaveLength(1);
    expect(second).not.toContain('First passage.');
  });
});
