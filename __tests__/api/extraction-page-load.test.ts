// Tests for bug #528 (SRS-301.8, AO, Extractable documents): the extraction page
// stayed on "Loading…" forever when one of its two load requests failed.
//
// loadExtractionPage always returns a result, so the page can stop loading and
// show a message: a network failure, a response that isn't JSON, and a server
// error each become an error message.
import { describe, expect, it } from 'vitest';
import { DOCUMENTS_LOAD_ERROR, EXTRACTIONS_LOAD_ERROR, loadExtractionPage } from '../../lib/extractionPageData';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const DOCUMENTS = { documents: [{ document_id: 7 }], followsAnyTown: true, towns: [{ town_id: 1, name: 'Salem' }] };
const EXTRACTIONS = { extractions: [{ extraction_id: 3 }] };

// A fetch that answers each of the page's two requests from the given handlers.
function fetchWith(handlers: { documents: () => Promise<Response>; extractions: () => Promise<Response> }) {
  return (url: string) => (url === '/api/extractions/documents' ? handlers.documents() : handlers.extractions());
}

const ok = { documents: async () => json(DOCUMENTS), extractions: async () => json(EXTRACTIONS) };

describe('Bug #528: the extraction page load always finishes', () => {
  it('returns the documents, towns, and extractions when both requests succeed', async () => {
    const data = await loadExtractionPage('token', fetchWith(ok));
    expect(data).toEqual({
      status: 'loaded',
      documents: DOCUMENTS.documents,
      followsAnyTown: true,
      towns: DOCUMENTS.towns,
      extractions: EXTRACTIONS.extractions,
    });
  });

  it('returns "Could not load documents." when the documents request fails on the network', async () => {
    const data = await loadExtractionPage('token', fetchWith({ ...ok, documents: async () => { throw new TypeError('Failed to fetch'); } }));
    expect(data).toEqual({ status: 'error', message: DOCUMENTS_LOAD_ERROR });
    expect(DOCUMENTS_LOAD_ERROR).toBe('Could not load documents.');
  });

  it('returns an error message when the extractions request fails on the network', async () => {
    const data = await loadExtractionPage('token', fetchWith({ ...ok, extractions: async () => { throw new TypeError('Failed to fetch'); } }));
    expect(data).toEqual({ status: 'error', message: EXTRACTIONS_LOAD_ERROR });
  });

  it('returns an error message when the server answers with a page that is not JSON', async () => {
    const html = async () => new Response('<html>Bad gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } });
    const data = await loadExtractionPage('token', fetchWith({ ...ok, documents: html }));
    expect(data).toEqual({ status: 'error', message: DOCUMENTS_LOAD_ERROR });
  });

  it("shows the server's own message when it sends one", async () => {
    const data = await loadExtractionPage('token', fetchWith({ ...ok, documents: async () => json({ error: 'Could not load the documents.' }, 500) }));
    expect(data).toEqual({ status: 'error', message: 'Could not load the documents.' });
  });

  it('reports a signed-out user when the session has expired, even if the other request failed', async () => {
    const expired = async () => new Response('Unauthorized', { status: 401 });
    const data = await loadExtractionPage('token', fetchWith({ documents: expired, extractions: async () => { throw new TypeError('Failed to fetch'); } }));
    expect(data).toEqual({ status: 'signedOut' });
  });

  it('sends the access token with both requests', async () => {
    const seen: string[] = [];
    const fetchFn = async (url: string, init: { headers: Record<string, string> }) => {
      seen.push(`${url} ${init.headers.Authorization}`);
      return url === '/api/extractions/documents' ? json(DOCUMENTS) : json(EXTRACTIONS);
    };
    await loadExtractionPage('abc', fetchFn);
    expect(seen.sort()).toEqual(['/api/extractions Bearer abc', '/api/extractions/documents Bearer abc']);
  });
});
