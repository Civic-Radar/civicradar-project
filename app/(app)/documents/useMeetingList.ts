import { useState } from 'react';
import type { MeetingList } from '../../../lib/meetingTimeline';

// SRS-209.4: which list the Documents page shows. "Upcoming meetings" is
// selected each time the page loads. Kept in its own hook so tests can set it.
export function useMeetingList(): [MeetingList, (list: MeetingList) => void] {
  return useState<MeetingList>('upcoming');
}
