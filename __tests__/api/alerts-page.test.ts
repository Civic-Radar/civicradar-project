// SRS-404.3: the Alerts page shows each in-app update, what is new, and its meeting.
import { createRequire } from 'node:module';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// @types/react-dom is not installed, so react-dom/server is loaded with only the one function used here.
const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

import { AlertCards } from '../../app/(app)/alerts/AlertsList';
import { describeAlerts, type AlertRow } from '../../lib/alerts';

// The components don't import React; Vitest compiles their JSX to React.createElement.
beforeEach(() => {
  vi.stubGlobal('React', React);
});

const row: AlertRow = {
  alert_id: 7,
  created_at: '2026-11-19T15:05:00Z',
  update_type: 'Agenda item added',
  new_value: 'New housing item',
  detected_at: '2026-11-19T15:05:00Z',
  meeting_id: 42,
  meeting_title: 'City Council',
  start_at: '2026-11-25T00:00:00Z',
  town: 'Salem',
  meeting_time_zone: 'America/New_York',
};

function render(rows: AlertRow[]) {
  return renderToStaticMarkup(React.createElement(AlertCards, { alerts: describeAlerts(rows) }));
}

describe('Alerts page (SRS-404.3)', () => {
  it('identifies the new material and the meeting it belongs to', () => {
    const html = render([row]);
    expect(html).toContain('New agenda item');
    expect(html).toContain('New housing item');
    expect(html).toContain('City Council');
    expect(html).toContain('Salem');
    expect(html).toContain('Found 11/19/2026 10:05 AM ET');
  });

  it('links each update to its meeting', () => {
    expect(render([row])).toContain('href="/meetings/42"');
  });

  it('lists every update, newest first as given', () => {
    const html = render([row, { ...row, alert_id: 3, update_type: 'Recording published', new_value: 'https://example.org/rec' }]);
    expect(html.indexOf('New agenda item')).toBeLessThan(html.indexOf('New recording'));
  });

  it('says there are no updates yet when the list is empty', () => {
    expect(render([])).toContain('No updates yet.');
  });
});
