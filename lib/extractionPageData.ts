// Loads what the extraction page shows: the extractable documents (SRS-301.8) and
// the signed-in user's extraction requests.
//
// Always returns a result. A request that fails on the network, or a response
// that isn't JSON, becomes an error message for the page, so the page never
// stays on "Loading…" (bug #528).
import type { ExtractableDocument, Extraction } from './extractions';

export const DOCUMENTS_LOAD_ERROR = 'Could not load documents.';
export const EXTRACTIONS_LOAD_ERROR = 'Could not load your extractions.';

export type ExtractionPageData =
  | { status: 'signedOut' }
  | { status: 'error'; message: string }
  | {
      status: 'loaded';
      documents: ExtractableDocument[];
      followsAnyTown: boolean;
      towns: { town_id: number; name: string }[];
      extractions: Extraction[];
      // SRS-301.7 (bug #527): the user has already used today's extraction requests.
      limitReached: boolean;
    };

type Fetch = (url: string, init: { headers: Record<string, string> }) => Promise<Response>;

// The response and its JSON body; null when the request failed or the body isn't JSON.
async function getJson(fetchFn: Fetch, url: string, headers: Record<string, string>) {
  try {
    const res = await fetchFn(url, { headers });
    // An expired session is told apart from a failed load before the body is read.
    if (res.status === 401) return { status: 401, ok: false, data: null };
    return { status: res.status, ok: res.ok, data: await res.json() };
  } catch {
    return null;
  }
}

export async function loadExtractionPage(accessToken: string, fetchFn: Fetch = fetch): Promise<ExtractionPageData> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const [docs, ext] = await Promise.all([
    getJson(fetchFn, '/api/extractions/documents', headers),
    getJson(fetchFn, '/api/extractions', headers),
  ]);

  if (docs?.status === 401 || ext?.status === 401) return { status: 'signedOut' };
  if (!docs) return { status: 'error', message: DOCUMENTS_LOAD_ERROR };
  if (!docs.ok) return { status: 'error', message: docs.data?.error || DOCUMENTS_LOAD_ERROR };
  if (!ext) return { status: 'error', message: EXTRACTIONS_LOAD_ERROR };
  if (!ext.ok) return { status: 'error', message: ext.data?.error || EXTRACTIONS_LOAD_ERROR };

  return {
    status: 'loaded',
    documents: docs.data.documents ?? [],
    followsAnyTown: docs.data.followsAnyTown !== false,
    towns: docs.data.towns ?? [],
    extractions: ext.data.extractions ?? [],
    limitReached: ext.data.limitReached === true,
  };
}
