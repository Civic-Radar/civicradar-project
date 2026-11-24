import { describe, expect, it } from 'vitest';
import { alertHeadline, describeAlert, describeAlerts, type AlertRow } from '../../lib/alerts';

// Pure functions: plain inputs in, plain values out. No database, fetch, or clock.
const row: AlertRow = {
  alert_id: 7,
  created_at: '2026-11-19T15:05:00Z',
  update_type: 'Document published',
  new_value: 'Budget Attachment',
  detected_at: '2026-11-19T15:05:00Z',
  meeting_id: 42,
  meeting_title: 'City Council',
  start_at: '2026-11-25T00:00:00Z',
  town: 'Salem',
  meeting_time_zone: 'America/New_York',
};

describe('alertHeadline (SRS-404.3)', () => {
  it('names each kind of new meeting material', () => {
    expect(alertHeadline('Agenda item added')).toBe('New agenda item');
    expect(alertHeadline('Document published')).toBe('New document');
    expect(alertHeadline('Recording published')).toBe('New recording');
  });

  it('falls back to a general headline for other updates', () => {
    expect(alertHeadline('Start time changed')).toBe('Meeting updated');
  });
});

describe('describeAlert (SRS-404.3)', () => {
  it('identifies the new material and its meeting', () => {
    expect(describeAlert(row)).toEqual({
      id: 7,
      headline: 'New document',
      detail: 'Budget Attachment',
      meetingId: 42,
      meetingTitle: 'City Council',
      meetingHref: '/meetings/42',
      town: 'Salem',
      meetingStart: '11/24/2026 7:00 PM ET',
      foundAt: '11/19/2026 10:05 AM ET',
    });
  });

  it('shows times in the town time zone', () => {
    const chicago = describeAlert({ ...row, meeting_time_zone: 'America/Chicago' });
    expect(chicago.meetingStart).toBe('11/24/2026 6:00 PM CT');
  });

  it('copes with a missing title, start time, or material name', () => {
    const view = describeAlert({ ...row, meeting_title: '  ', start_at: null, new_value: null });
    expect(view.meetingTitle).toBe('Untitled meeting');
    expect(view.meetingStart).toBeNull();
    expect(view.detail).toBeNull();
  });

  it('keeps the newest-first order it is given', () => {
    const older = { ...row, alert_id: 3, update_type: 'Agenda item added', new_value: 'New housing item' };
    expect(describeAlerts([row, older]).map((a) => [a.id, a.headline])).toEqual([
      [7, 'New document'],
      [3, 'New agenda item'],
    ]);
  });
});
