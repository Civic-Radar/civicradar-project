import { useEffect, useState } from 'react';

// Fields returned by GET /api/documents (SRS-201.1).
export type DocumentListEntry = {
  document_id: number;
  title: string;
  town_id: number;
  meeting_id: number;
  retrieved_at: string;
};

export type DocumentsState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'loadFailed' }
  | { status: 'loaded'; documents: DocumentListEntry[] };

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
          if (!ignore) setState({ status: 'loaded', documents: data.documents ?? [] });
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
