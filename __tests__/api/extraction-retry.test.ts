// Tests for SRS-307.6, AO, Retry attempt (bug #654):
// "The system shall create a new extraction attempt for the same document when
//  the user selects Retry."
import { describe, expect, it } from 'vitest';
import { DAILY_LIMIT_MESSAGE } from '../../lib/extractions';
import { RETRY_ERROR, RETRY_NO_DOCUMENT_ERROR, retryExtraction } from '../../lib/extractionRetry';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

type Call = { url: string; method: string; headers: Record<string, string>; body: string };

// A fetch that records each request and answers with the given response.
function recordingFetch(respond: () => Promise<Response>) {
  const calls: Call[] = [];
  const fetchFn = (url: string, init: Omit<Call, 'url'>) => {
    calls.push({ url, ...init });
    return respond();
  };
  return { calls, fetchFn };
}

const FAILED = { extraction_id: 12, document_id: 7 };

describe('SRS-307.6: Retry creates a new extraction attempt for the same document', () => {
  it('requests a new extraction for the failed extraction\'s document', async () => {
    const { calls, fetchFn } = recordingFetch(async () => json({ extraction: { extraction_id: 13, document_id: 7, status: 'Queued' } }, 201));
    await retryExtraction(FAILED, 'token', fetchFn);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('/api/extractions');
    expect(calls[0].method).toBe('POST');
    expect(JSON.parse(calls[0].body)).toEqual({ document_id: 7 });
  });

  it('returns the new attempt, which is a different extraction from the failed one', async () => {
    const { fetchFn } = recordingFetch(async () => json({ extraction: { extraction_id: 13, document_id: 7, status: 'Queued' } }, 201));
    const result = await retryExtraction(FAILED, 'token', fetchFn);

    expect(result).toEqual({ status: 'created', extractionId: 13 });
    expect(result).not.toEqual({ status: 'created', extractionId: FAILED.extraction_id });
  });

  it('sends the signed-in user\'s access token', async () => {
    const { calls, fetchFn } = recordingFetch(async () => json({ extraction: { extraction_id: 13 } }, 201));
    await retryExtraction(FAILED, 'abc', fetchFn);
    expect(calls[0].headers.Authorization).toBe('Bearer abc');
  });

  it('creates exactly one attempt per Retry', async () => {
    const { calls, fetchFn } = recordingFetch(async () => json({ extraction: { extraction_id: 13 } }, 201));
    await retryExtraction(FAILED, 'token', fetchFn);
    expect(calls).toHaveLength(1);
  });

  it('shows the daily limit message when the user has no requests left today', async () => {
    const { fetchFn } = recordingFetch(async () => json({ error: DAILY_LIMIT_MESSAGE }, 429));
    expect(await retryExtraction(FAILED, 'token', fetchFn)).toEqual({ status: 'error', message: DAILY_LIMIT_MESSAGE });
  });

  it('returns an error message when the request fails on the network', async () => {
    const { fetchFn } = recordingFetch(async () => { throw new TypeError('Failed to fetch'); });
    expect(await retryExtraction(FAILED, 'token', fetchFn)).toEqual({ status: 'error', message: RETRY_ERROR });
  });

  it('returns an error message when the server answers with a page that is not JSON', async () => {
    const { fetchFn } = recordingFetch(async () => new Response('<html>Bad gateway</html>', { status: 502 }));
    expect(await retryExtraction(FAILED, 'token', fetchFn)).toEqual({ status: 'error', message: RETRY_ERROR });
  });

  it('reports a signed-out user when the session has expired', async () => {
    const { fetchFn } = recordingFetch(async () => new Response('Unauthorized', { status: 401 }));
    expect(await retryExtraction(FAILED, 'token', fetchFn)).toEqual({ status: 'signedOut' });
  });

  it('sends no request when the failed extraction\'s document was removed', async () => {
    const { calls, fetchFn } = recordingFetch(async () => json({}, 201));
    const result = await retryExtraction({ document_id: null }, 'token', fetchFn);
    expect(result).toEqual({ status: 'error', message: RETRY_NO_DOCUMENT_ERROR });
    expect(calls).toHaveLength(0);
  });
});
