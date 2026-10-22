import { useEffect, useState } from 'react';

// Fields returned by GET /api/documents/[id] (SRS-203.1). The summary fields
// (SRS-204.2) are null unless the document's summary is Complete.
export type DocumentIdentification = {
  document_id: number;
  meeting_id: number;
  town_id: number;
  title: string;
  document_type: string;
  source_url: string;
  retrieved_at: string;
  summary_text: string | null;
  summary_generated_at: string | null;
};

export type DocumentState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'notFound' }
  | { status: 'loadFailed' }
  | { status: 'loaded'; document: DocumentIdentification };

// Loads one document for its detail page with the signed-in user's token.
// A bad id (400) reads as not found; the API's error text is never shown.
export function useDocument(id: string): DocumentState {
  const [state, setState] = useState<DocumentState>({ status: 'loading' });

  useEffect(() => {
    // Ignores a late response after the id changes or the page unmounts.
    let ignore = false;
    const token = localStorage.getItem('access_token');
    if (!token) { setState({ status: 'signedOut' }); return; }
    setState({ status: 'loading' });

    async function load() {
      try {
        const res = await fetch(`/api/documents/${encodeURIComponent(id)}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (ignore) return;
        if (res.status === 401) setState({ status: 'signedOut' });
        else if (res.status === 404 || res.status === 400) setState({ status: 'notFound' });
        else if (!res.ok) setState({ status: 'loadFailed' });
        else {
          const data = await res.json();
          if (!ignore) setState({ status: 'loaded', document: data.document });
        }
      } catch {
        if (!ignore) setState({ status: 'loadFailed' });
      }
    }
    load();
    return () => { ignore = true; };
  }, [id]);

  return state;
}
