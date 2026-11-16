import { useEffect, useState } from 'react';

// Fields returned by GET /api/documents (SRS-201.1, town_name SRS-212.1,
// summary_status SRS-210.3, document_type and meeting_start_at for the entry's details line,
// meeting_time_zone so the meeting date uses the town's zone, SRS-202.2).
export type DocumentListEntry = {
  document_id: number;
  title: string;
  town_id: number;
  meeting_id: number;
  retrieved_at: string;
  summary_status: 'Pending' | 'Complete' | 'Failed';
  document_type: 'Agenda' | 'Packet' | 'Minutes' | 'Other';
  town_name: string | null;
  meeting_start_at: string | null;
  meeting_time_zone: string | null;
};

export type DocumentsState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'loadFailed' }
  // followsTowns is false when the user follows no town (SRS-201.3).
  | { status: 'loaded'; documents: DocumentListEntry[]; followsTowns: boolean };

// Loads the documents from the signed-in user's followed towns for the Documents page.
// The API's error text is never shown.
export function useDocuments(): DocumentsState {
  const [state, setState] = useState<DocumentsState>({ status: 'loading' });

  useEffect(() => {
    // Ignores a late response after the page unmounts.
    let ignore = false;
    const token = localStorage.getItem('access_token');
    if (!token) { setState({ status: 'signedOut' }); return; }

    async function load() {
      try {
        const res = await fetch('/api/documents', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (ignore) return;
        if (res.status === 401) setState({ status: 'signedOut' });
        else if (!res.ok) setState({ status: 'loadFailed' });
        else {
          const data = await res.json();
          if (!ignore) {
            setState({ status: 'loaded', documents: data.documents ?? [], followsTowns: data.follows_towns !== false });
          }
        }
      } catch {
        if (!ignore) setState({ status: 'loadFailed' });
      }
    }
    load();
    return () => { ignore = true; };
  }, []);

  return state;
}
