// Tests for SRS-501.4, YA, Incomplete check label, and SRS-501.5, YA, Empty dashboard message.
//
// SRS-501.4 acceptance: Given Salem's check succeeded and Brookline's failed,
// When the dashboard opens, Then Salem's results are shown and "Could not check
// the source" appears next to Brookline.
// SRS-501.5 acceptance: Given the matching result is Complete with zero meetings,
// When the dashboard opens, Then "No matching meetings found." is displayed and
// no incomplete label appears.
import { createRequire } from 'node:module';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// @types/react-dom is not installed, so react-dom/server is loaded with only the one function used here.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

import { MeetingResults, type FailedTown, type Meeting } from '../../app/(app)/dashboard/DashboardMeetings';

// The components don't import React; Vitest compiles their JSX to React.createElement.
beforeEach(() => {
  vi.stubGlobal('React', React);
});

const salemMeeting: Meeting = {
  meeting_id: 1192,
  title: 'Salem City Council',
  start_at: '2026-11-12T23:00:00Z',
  is_canceled: false,
  town: 'Salem',
  meeting_time_zone: 'America/New_York',
  matched_topics: [{ topic: 'Housing', evidence_text: 'Zoning for housing' }],
  followed_directly: false,
};

const render = (meetings: Meeting[], failedTowns: FailedTown[]) =>
  renderToStaticMarkup(React.createElement(MeetingResults, { meetings, failedTowns }));

describe('Incomplete check label (SRS-501.4)', () => {
  it("shows Salem's meetings and \"Could not check the source\" next to Brookline", () => {
    const markup = render([salemMeeting], [{ town_id: 2, name: 'Brookline' }]);

    expect(markup).toContain('Salem City Council');
    expect(markup).toContain('href="/meetings/1192"');
    expect(markup).toMatch(/Brookline<\/span><span[^>]*>Could not check the source<\/span>/);
  });

  it('labels every town that could not be checked, and only those', () => {
    const markup = render([salemMeeting], [
      { town_id: 2, name: 'Brookline' },
      { town_id: 3, name: 'Newton' },
    ]);

    expect(markup.match(/Could not check the source/g)).toHaveLength(2);
    expect(markup).toMatch(/Newton<\/span><span[^>]*>Could not check the source/);
    expect(markup).not.toMatch(/Salem<\/span><span[^>]*>Could not check the source/);
  });

  it('shows the labels without "No matching meetings found." when no checked town has a match', () => {
    const markup = render([], [{ town_id: 2, name: 'Brookline' }]);

    expect(markup).toContain('Could not check the source');
    expect(markup).not.toContain('No matching meetings found.');
  });
});

describe('Empty dashboard message (SRS-501.5)', () => {
  it('shows "No matching meetings found." and no incomplete label for a Complete result with zero meetings', () => {
    const markup = render([], []);

    expect(markup).toContain('No matching meetings found.');
    expect(markup).not.toContain('Could not check the source');
  });

  it('shows no incomplete label when every check succeeded and meetings were found', () => {
    const markup = render([salemMeeting], []);

    expect(markup).toContain('Salem City Council');
    expect(markup).not.toContain('Could not check the source');
    expect(markup).not.toContain('No matching meetings found.');
  });
});
