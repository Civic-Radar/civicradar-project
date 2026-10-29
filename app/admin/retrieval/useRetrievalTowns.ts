import { useEffect, useState } from 'react';

// Fields returned by GET /api/towns, which already leaves out removed towns.
export type RetrievalTown = {
  town_id: number;
  name: string;
  source_account_id: string;
  meeting_time_zone: string;
};

export type RetrievalTownsState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'loadFailed' }
  | { status: 'loaded'; token: string; towns: RetrievalTown[] };

// Loads the supported towns for the retrieval page (SRS-220.3).
// The API's error text is never shown.
export function useRetrievalTowns(): RetrievalTownsState {
  const [state, setState] = useState<RetrievalTownsState>({ status: 'loading' });

  useEffect(() => {
    // Ignores a late response after the page unmounts.
    let ignore = false;
    const token = localStorage.getItem('access_token');
    if (!token) { setState({ status: 'signedOut' }); return; }
    const accessToken: string = token;

    async function load() {
      try {
        const res = await fetch('/api/towns', {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });
        if (ignore) return;
        if (res.status === 401) setState({ status: 'signedOut' });
        else if (!res.ok) setState({ status: 'loadFailed' });
        else {
          const data = await res.json();
          if (!ignore) setState({ status: 'loaded', token: accessToken, towns: data.towns ?? [] });
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
