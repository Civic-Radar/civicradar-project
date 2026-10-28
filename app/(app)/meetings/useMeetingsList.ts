import { useEffect, useState } from 'react';

// Towns returned by GET /api/meetings, which already leaves out removed towns.
export type MeetingTown = { town_id: number; name: string; meeting_time_zone: string };

// Fields returned by GET /api/meetings (SRS-220.3).
export type Meeting = {
  meeting_id: number;
  town_id: number;
  title: string | null;
  source_body_name: string | null;
  source_start_time: string | null;
  start_at: string | null;
  location: string | null;
  online_link: string | null;
  source_url: string | null;
};

export type MeetingsListState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'loadFailed' }
  | { status: 'loaded'; towns: MeetingTown[]; meetings: Meeting[]; followedTownIds: number[] };

// Loads the stored meetings and the signed-in user's followed towns for the meetings page.
// The API's error text is never shown.
export function useMeetingsList(): MeetingsListState {
  const [state, setState] = useState<MeetingsListState>({ status: 'loading' });

  useEffect(() => {
    // Ignores a late response after the page unmounts.
    let ignore = false;
    const token = localStorage.getItem('access_token');
    if (!token) { setState({ status: 'signedOut' }); return; }

    async function load() {
      try {
        const [followedRes, meetingsRes] = await Promise.all([
          fetch('/api/followed-towns', {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          }),
          fetch('/api/meetings', { cache: 'no-store' }),
        ]);
        if (ignore) return;
        if (followedRes.status === 401) { setState({ status: 'signedOut' }); return; }
        if (!followedRes.ok || !meetingsRes.ok) { setState({ status: 'loadFailed' }); return; }
        const followed = await followedRes.json();
        const data = await meetingsRes.json();
        if (ignore) return;
        const followedTownIds = ((followed.towns ?? []) as { town_id: number; followed: boolean }[])
          .filter((town) => town.followed)
          .map((town) => town.town_id);
        setState({ status: 'loaded', towns: data.towns ?? [], meetings: data.meetings ?? [], followedTownIds });
      } catch {
        if (!ignore) setState({ status: 'loadFailed' });
      }
    }
    load();
    return () => { ignore = true; };
  }, []);

  return state;
}
