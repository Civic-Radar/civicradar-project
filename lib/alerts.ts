import { formatDashboardStart } from './dashboardMeetings';

// One in-app alert as GET /api/alerts returns it (a list_user_alerts row).
export type AlertRow = {
  alert_id: number;
  created_at: string;
  update_type: string;
  new_value: string | null;
  detected_at: string;
  meeting_id: number;
  meeting_title: string | null;
  start_at: string | null;
  town: string;
  meeting_time_zone: string;
};

// What the Alerts page shows for one alert.
export type AlertView = {
  id: number;
  headline: string; // "New agenda item"
  detail: string | null; // the new material's title, or the recording link
  meetingId: number;
  meetingTitle: string;
  meetingHref: string;
  town: string;
  meetingStart: string | null; // "11/24/2026 7:00 PM ET"
  foundAt: string | null; // when the change was found, in the town's time zone
};

// SRS-404.3: the kinds of new meeting material, named for a resident.
const HEADLINES: Record<string, string> = {
  'Agenda item added': 'New agenda item',
  'Document published': 'New document',
  'Recording published': 'New recording',
};

/** The headline for an update type, e.g. 'Document published' -> 'New document'. */
export function alertHeadline(updateType: string): string {
  return HEADLINES[updateType] ?? 'Meeting updated';
}

/**
 * Turns one alert row into what the page shows. Pure: the same row always gives
 * the same view, and times are shown in the meeting's town time zone.
 */
export function describeAlert(row: AlertRow): AlertView {
  const detail = row.new_value?.trim() ? row.new_value.trim() : null;
  return {
    id: row.alert_id,
    headline: alertHeadline(row.update_type),
    detail,
    meetingId: row.meeting_id,
    meetingTitle: row.meeting_title?.trim() ? row.meeting_title.trim() : 'Untitled meeting',
    meetingHref: `/meetings/${row.meeting_id}`,
    town: row.town,
    meetingStart: row.start_at ? formatDashboardStart(row.start_at, row.meeting_time_zone) : null,
    foundAt: formatDashboardStart(row.detected_at, row.meeting_time_zone),
  };
}

/** Every alert row the API returned, as page views, in the order given (newest first). */
export function describeAlerts(rows: AlertRow[]): AlertView[] {
  return rows.map(describeAlert);
}
