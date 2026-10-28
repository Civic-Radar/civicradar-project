import type { Meeting } from './useMeetingsList';

// The meetings a user sees on the meetings page (SRS-220.3): only meetings of a
// followed town, and only the selected town's when one is selected (null means all).
export function meetingsForUser(meetings: Meeting[], followedTownIds: number[], selectedTownId: number | null): Meeting[] {
  const followed = new Set(followedTownIds);
  return meetings.filter(
    (meeting) => followed.has(meeting.town_id) && (selectedTownId === null || meeting.town_id === selectedTownId),
  );
}
