// SRS-307.6, AO, Retry attempt.
// "The system shall create a new extraction attempt for the same document when
//  the user selects Retry."
//
// A retry is a new extraction request for the failed extraction's document. The
// failed extraction is left as it is, so the user keeps a record of both attempts.
// The request goes through POST /api/extractions, so a retry follows the same
// rules as a first request: PDFs only, the daily limit (SRS-301.7), and one
// request in progress per document (SRS-306.3).
//
// Always returns a result, so the page can show a message when the retry fails.
export const RETRY_ERROR = 'The extraction could not be retried.';
export const RETRY_NO_DOCUMENT_ERROR = 'The source document is no longer available, so the extraction cannot be retried.';

export type RetryResult =
  | { status: 'created'; extractionId: number }
  | { status: 'signedOut' }
  | { status: 'error'; message: string };

type Fetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<Response>;

export async function retryExtraction(
  failed: { document_id: number | null },
  accessToken: string,
  fetchFn: Fetch = fetch,
): Promise<RetryResult> {
  if (failed.document_id === null) return { status: 'error', message: RETRY_NO_DOCUMENT_ERROR };

  try {
    const res = await fetchFn('/api/extractions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ document_id: failed.document_id }),
    });
    if (res.status === 401) return { status: 'signedOut' };

    const data = await res.json();
    if (!res.ok) return { status: 'error', message: data?.error || RETRY_ERROR };

    const extractionId = Number(data?.extraction?.extraction_id);
    if (!Number.isInteger(extractionId)) return { status: 'error', message: RETRY_ERROR };
    return { status: 'created', extractionId };
  } catch {
    // The request failed on the network, or the response was not JSON.
    return { status: 'error', message: RETRY_ERROR };
  }
}

// SRS-307.5, AO, Retry control.
// "The system shall display a Retry control when an extraction's status changes
//  to Failed."
// Only a Failed extraction shows Retry: a Queued or Processing one is still
// running, and a Completed one has its results.
export const RETRY_LABEL = 'Retry';
export const RETRYING_LABEL = 'Retrying…';

export function showsRetryControl(status: string | null | undefined): boolean {
  return status === 'Failed';
}
