import { describe, expect, it } from 'vitest';
import { radarReason, type MatchingMeeting } from '../../lib/radarReason';

// Issue #526 (SRS-401.5): the "Why this is on your radar" panel must show the
// reason this meeting matched (its matched topic tags and the agenda text that
// produced each one), never the user's whole list of followed topics.
const SALEM = 1;
const BROOKLINE = 2;

const housing = { topic: 'Housing', evidence_text: 'Vote on the housing production plan.' };
const parking = { topic: 'Parking', evidence_text: 'Resident parking permit fees.' };

// What GET /api/matching-meetings returns for a user who follows Salem and the
// topics Housing and Parking, and who also follows meeting 30 directly.
const matching: MatchingMeeting[] = [
  { meeting_id: 10, matched_topics: [housing], followed_directly: false },
  { meeting_id: 20, matched_topics: [housing, parking], followed_directly: true },
  { meeting_id: 30, matched_topics: [], followed_directly: true },
];

describe('radarReason (#526)', () => {
  it('returns the topics and agenda text of a meeting that matched', () => {
    expect(radarReason({ meeting_id: 20, town_id: SALEM }, matching, [SALEM])).toEqual({
      kind: 'matched',
      topics: [housing, parking],
      followedDirectly: true,
    });
  });

  it('returns only Housing for a meeting tagged Housing when the user also follows Parking', () => {
    const reason = radarReason({ meeting_id: 10, town_id: SALEM }, matching, [SALEM]);
    expect(reason).toEqual({ kind: 'matched', topics: [housing], followedDirectly: false });
  });

  it('returns a matched reason with no topics for a meeting that is only followed directly', () => {
    expect(radarReason({ meeting_id: 30, town_id: BROOKLINE }, matching, [SALEM])).toEqual({
      kind: 'matched',
      topics: [],
      followedDirectly: true,
    });
  });

  it('says the town is followed when a meeting there has none of the followed topics', () => {
    expect(radarReason({ meeting_id: 40, town_id: SALEM }, matching, [SALEM])).toEqual({
      kind: 'notMatched',
      followsTown: true,
    });
  });

  it('says the town is not followed for a meeting in another town', () => {
    expect(radarReason({ meeting_id: 50, town_id: BROOKLINE }, matching, [SALEM])).toEqual({
      kind: 'notMatched',
      followsTown: false,
    });
  });

  it('does not match a meeting when the matching result is empty', () => {
    expect(radarReason({ meeting_id: 10, town_id: SALEM }, [], [SALEM])).toEqual({
      kind: 'notMatched',
      followsTown: true,
    });
  });

  it('returns unknown when the matching result could not be loaded', () => {
    expect(radarReason({ meeting_id: 10, town_id: SALEM }, null, [SALEM])).toEqual({ kind: 'unknown' });
  });

  it('returns unknown for an unmatched meeting when the followed towns could not be loaded', () => {
    expect(radarReason({ meeting_id: 40, town_id: SALEM }, matching, null)).toEqual({ kind: 'unknown' });
  });
});
