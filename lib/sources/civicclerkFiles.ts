// Reads the text of one document a town published on CivicClerk (SRS-302.1).
//
// Kept separate from lib/sources/civicclerk.ts (meeting retrieval) so the two
// features can change without touching each other's file.
//
// CivicClerk can return a published file as plain text, so no PDF library is
// needed: GetMeetingFileStream(fileId=<id>,plainText=true).

const FILE_TEXT_URL =
  'https://{code}.api.civicclerk.com/v1/Meetings/GetMeetingFileStream(fileId={id},plainText=true)';

const REQUEST_TIMEOUT_MS = 30_000;

// Fewer readable characters than this means the file had no usable text
// (for example a scanned image with no text layer).
const MIN_TEXT_LENGTH = 20;

// Failure causes the extractions table accepts (SRS-307.2).
export type DocumentTextFailure = 'Missing source file' | 'Unreadable file' | 'Other';

export class DocumentTextError extends Error {
  constructor(
    readonly failureCause: DocumentTextFailure,
    message: string,
  ) {
    super(message);
    this.name = 'DocumentTextError';
  }
}

// CivicClerk may send the text as a JSON string or as plain text; accept both.
function readBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed.startsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // Not JSON after all; use it as-is.
    }
  }
  return body;
}

export async function fetchDocumentText(
  sourceAccountId: string,
  sourceFileId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  if (!/^[a-z0-9-]+$/i.test(sourceAccountId)) {
    throw new DocumentTextError('Other', 'Invalid CivicClerk account id.');
  }
  // Placeholder documents (like the Sprint 1 demo files) have no CivicClerk file.
  if (!/^\d+$/.test(sourceFileId)) {
    throw new DocumentTextError('Missing source file', 'The document has no CivicClerk file id.');
  }

  const url = FILE_TEXT_URL.replace('{code}', sourceAccountId).replace('{id}', sourceFileId);

  let response: Response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    throw new DocumentTextError('Other', `CivicClerk could not be reached: ${(error as Error).message}`);
  }

  if (response.status === 404) {
    throw new DocumentTextError('Missing source file', 'CivicClerk no longer has this file.');
  }
  if (!response.ok) {
    throw new DocumentTextError('Other', `CivicClerk returned status ${response.status}.`);
  }

  const text = readBody(await response.text()).replace(/\r\n?/g, '\n').trim();
  if (text.replace(/\s/g, '').length < MIN_TEXT_LENGTH) {
    throw new DocumentTextError('Unreadable file', 'The file has no readable text.');
  }
  return text;
}
