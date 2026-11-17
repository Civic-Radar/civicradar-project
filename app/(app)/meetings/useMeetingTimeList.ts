import { useState } from 'react';
import type { MeetingTimeList } from './meetingsByDate';

// SRS-220.11: which list the meetings page shows. "Upcoming meetings" is
// selected each time the page loads. Kept in its own hook so tests can set it.
export function useMeetingTimeList(): [MeetingTimeList, (list: MeetingTimeList) => void] {
  return useState<MeetingTimeList>('upcoming');
}
