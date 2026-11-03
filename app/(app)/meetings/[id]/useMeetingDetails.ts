import { useEffect, useState } from 'react';

// Fields returned by GET /api/meetings/[id] (SRS-502.2, SRS-502.3, SRS-502.8, SRS-502.9).
export type MeetingDetails = {
  meeting_id: number;
  title: string | null;
  source_body_name: string | null;
  source_start_time: string | null;
  start_at: string | null;
  location: string | null;
  online_link: string | null;
  source_url: string | null;
  town_id: number;
  town_name: string | null;
  meeting_time_zone: string | null;
  body_name: string | null;
  provides_agenda_items: boolean;
  provides_recordings: boolean;
};

// The meeting's linked documents (SRS-502.4).
export type MeetingDocument = {
  document_id: number;
  title: string | null;
  document_type: string | null;
  source_url: string | null;
};

// SRS-502.6: one agenda item, in the source's order.
export type AgendaItem = {
  agenda_item_id: number;
  sort_order: number;
  title: string;
  item_text: string | null;
};

export type MeetingDetailsState =
  | { status: 'loading' }
  | { status: 'notFound' }
  | { status: 'loadFailed'; error: string }
  | {
      status: 'loaded';
      meeting: MeetingDetails;
      documents: MeetingDocument[];
      // The meeting's agenda items (SRS-502.6); empty when the source provides none.
      agendaItems?: AgendaItem[];
      // null when the followed towns could not be read (signed out or an error).
      followedTownIds: number[] | null;
      // Names of the topics the user follows; empty when none or not readable.
      followedTopics: string[];
    };

const LOAD_ERROR = 'Could not load the meeting.';

// Reads a signed-in list from GET /api/followed-towns or /api/followed-topics.
// Any failure gives null, so the panel just leaves that part out.
async function loadFollowed<T extends { followed: boolean }>(url: string, key: string, token: string | null): Promise<T[] | null> {
  if (!token) return null;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return ((data[key] ?? []) as T[]).filter((row) => row.followed);
  } catch {
    return null;
  }
}

// Loads one meeting with its documents for the meeting details page, plus the
// signed-in user's followed towns and topics for the "Why this is on your radar" panel.
export function useMeetingDetails(id: string): MeetingDetailsState {
  const [state, setState] = useState<MeetingDetailsState>({ status: 'loading' });

  useEffect(() => {
    // Ignores a late response after the page unmounts or the id changes.
    let ignore = false;
    const token = localStorage.getItem('access_token');

    async function load() {
      try {
        const [response, towns, topics] = await Promise.all([
          fetch(`/api/meetings/${encodeURIComponent(id)}`, { cache: 'no-store' }),
          loadFollowed<{ town_id: number; followed: boolean }>('/api/followed-towns', 'towns', token),
          loadFollowed<{ name: string; followed: boolean }>('/api/followed-topics', 'topics', token),
        ]);
        const data = await response.json();
        if (ignore) return;
        if (response.status === 404) { setState({ status: 'notFound' }); return; }
        if (!response.ok) { setState({ status: 'loadFailed', error: data.error || LOAD_ERROR }); return; }
        setState({
          status: 'loaded',
          meeting: data.meeting,
          documents: Array.isArray(data.documents) ? data.documents : [],
          agendaItems: Array.isArray(data.agenda_items) ? data.agenda_items : [],
          followedTownIds: towns ? towns.map((town) => town.town_id) : null,
          followedTopics: topics ? topics.map((topic) => topic.name) : [],
        });
      } catch {
        if (!ignore) setState({ status: 'loadFailed', error: LOAD_ERROR });
      }
    }
    setState({ status: 'loading' });
    load();
    return () => { ignore = true; };
  }, [id]);

  return state;
}
