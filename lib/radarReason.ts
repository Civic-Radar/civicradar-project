// SRS-401.5: why a meeting is on the user's radar, for the meeting details page.
// The reason comes from the matching result (GET /api/matching-meetings), so the
// page shows the same matched topic tags and agenda text as the dashboard.

// One matched topic tag and the agenda text that produced it.
export type MatchedTopic = { topic: string; evidence_text: string };

// The fields of a matching result row that the reason is built from.
export type MatchingMeeting = {
  meeting_id: number;
  matched_topics: MatchedTopic[];
  followed_directly: boolean;
};

export type RadarReason =
  // The meeting is in the matching result. topics is empty when the meeting is
  // there only because the user follows it directly.
  | { kind: 'matched'; topics: MatchedTopic[]; followedDirectly: boolean }
  // The meeting is not in the matching result.
  | { kind: 'notMatched'; followsTown: boolean }
  // The matching result or the followed towns could not be read, so nothing can
  // be said about why the meeting matched.
  | { kind: 'unknown' };

// matchingMeetings and followedTownIds are null when they could not be loaded.
// An empty list means they were loaded and hold nothing.
export function radarReason(
  meeting: { meeting_id: number; town_id: number },
  matchingMeetings: MatchingMeeting[] | null,
  followedTownIds: number[] | null,
): RadarReason {
  if (matchingMeetings === null) return { kind: 'unknown' };

  const match = matchingMeetings.find((row) => row.meeting_id === meeting.meeting_id);
  if (match) {
    return { kind: 'matched', topics: match.matched_topics, followedDirectly: match.followed_directly };
  }

  if (followedTownIds === null) return { kind: 'unknown' };
  return { kind: 'notMatched', followsTown: followedTownIds.includes(meeting.town_id) };
}
