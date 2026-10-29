// SRS-401.8: which selections a resident is missing, and the dashboard setup
// message that names them. A resident needs at least one followed town and one
// followed topic for matching to find meetings.

export type MissingSelection = 'towns' | 'topics' | 'both';

type Choice = { followed: boolean };

export function getMissingSelection(towns: Choice[], topics: Choice[]): MissingSelection | null {
  const noTowns = !towns.some((town) => town.followed);
  const noTopics = !topics.some((topic) => topic.followed);
  if (noTowns && noTopics) return 'both';
  if (noTowns) return 'towns';
  if (noTopics) return 'topics';
  return null;
}

export const SETUP_REASON =
  'Follow at least one town and one topic so Civic Radar can find meetings that interest you.';

export const SETUP_MESSAGES: Record<MissingSelection, { title: string; link: string }> = {
  towns: { title: "You aren't following any towns yet.", link: 'Choose towns' },
  topics: { title: "You aren't following any topics yet.", link: 'Choose topics' },
  both: { title: "You aren't following any towns or topics yet.", link: 'Choose towns and topics' },
};
