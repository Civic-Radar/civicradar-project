import type { DocumentType, MeetingFilesListing, MeetingListing, SourceFile, SourceMeeting } from './types';

// All CivicClerk specifics live in this file. {code} is the town's
// towns.source_account_id (e.g. Salem is "salemma").
const API_BASE_URL = 'https://{code}.api.civicclerk.com/v1';

// The API does not return a link to the meeting's public page, so it is
// derived from the CivicClerk portal address.
const PORTAL_EVENT_URL = 'https://{code}.portal.civicclerk.com/event/{id}/overview';

// File bytes are streamed by file id. The relative `url` on a published file
// is not used.
const FILE_STREAM_URL = `${API_BASE_URL}/Meetings/GetMeetingFileStream(fileId={id},plainText=false)`;

// Each Events page, body included, must arrive within this time, or the page
// counts as failed (SRS-220.1).
const PAGE_TIMEOUT_MS = 15_000;

// CivicClerk file types mapped to documents.document_type. Any other or
// missing type is Other.
const DOCUMENT_TYPES = new Map<string, DocumentType>([
  ['Agenda', 'Agenda'],
  ['Agenda Packet', 'Packet'],
  ['Minutes', 'Minutes'],
]);

interface CivicClerkLocation {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}

// Files come only from publishedFiles. The event's agendaFile and
// minutesFile hold no files in the saved Salem sample.
interface CivicClerkPublishedFile {
  fileId?: number | null;
  name?: string | null;
  type?: string | null;
}

interface CivicClerkEvent {
  id?: number | null;
  eventName?: string | null;
  categoryId?: number | null;
  categoryName?: string | null;
  startDateTime?: string | null;
  eventLocation?: CivicClerkLocation | null;
  publishedFiles?: CivicClerkPublishedFile[] | null;
}

interface CivicClerkPage {
  value?: CivicClerkEvent[];
  '@odata.nextLink'?: string;
}

// Empty or whitespace-only strings mean "not provided" (SRS-220.4).
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function joinLocation(location: CivicClerkLocation | null | undefined): string | null {
  if (!location) {
    return null;
  }

  const stateZip = [text(location.state), text(location.zipCode)].filter(Boolean).join(' ');
  const cityLine = [text(location.city), text(stateZip)].filter(Boolean).join(', ');
  const parts = [text(location.address1), text(location.address2), text(cityLine)].filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : null;
}

function eventId(event: CivicClerkEvent): string {
  if (event.id === null || event.id === undefined) {
    throw new Error('CivicClerk returned a meeting without an id');
  }

  return String(event.id);
}

function portalEventUrl(sourceAccountId: string, sourceMeetingId: string): string {
  return PORTAL_EVENT_URL.replace('{code}', sourceAccountId).replace('{id}', encodeURIComponent(sourceMeetingId));
}

function toSourceMeeting(event: CivicClerkEvent, sourceAccountId: string): SourceMeeting {
  const sourceMeetingId = eventId(event);

  return {
    sourceMeetingId,
    title: text(event.eventName),
    sourceBodyId: event.categoryId === null || event.categoryId === undefined ? null : String(event.categoryId),
    sourceBodyName: text(event.categoryName),
    sourceStartTime: text(event.startDateTime),
    location: joinLocation(event.eventLocation),
    onlineLink: null, // CivicClerk sends no online participation link (zoomMeetingId is not a link)
    sourceUrl: portalEventUrl(sourceAccountId, sourceMeetingId),
  };
}

function toDocumentType(sourceFileType: string | null): DocumentType {
  return (sourceFileType !== null && DOCUMENT_TYPES.get(sourceFileType)) || 'Other';
}

function toSourceFile(file: CivicClerkPublishedFile, sourceMeetingId: string, sourceAccountId: string): SourceFile {
  if (file.fileId === null || file.fileId === undefined) {
    throw new Error(`CivicClerk returned a file without an id under meeting ${sourceMeetingId}`);
  }

  const sourceFileId = String(file.fileId);
  const fileName = text(file.name);
  if (fileName === null) {
    throw new Error(`CivicClerk returned file ${sourceFileId} without a name under meeting ${sourceMeetingId}`);
  }

  const sourceFileType = text(file.type);

  return {
    sourceFileId,
    fileName,
    sourceFileType,
    documentType: toDocumentType(sourceFileType),
    downloadUrl: FILE_STREAM_URL.replace('{code}', sourceAccountId).replace('{id}', encodeURIComponent(sourceFileId)),
    sourcePageUrl: portalEventUrl(sourceAccountId, sourceMeetingId), // no per-file page; the meeting's page for now
    sizeBytes: null, // CivicClerk sends no file size
  };
}

// Fetches one page of events. Throws on a failed request, a timeout and a
// page without a meeting list.
async function fetchEventPage(url: string): Promise<{ events: CivicClerkEvent[]; nextLink: string | undefined }> {
  // The same signal also covers reading the body, so a hung page fails.
  const signal = AbortSignal.timeout(PAGE_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  } catch (error) {
    throw new Error(`CivicClerk could not be reached: ${(error as Error).message}`);
  }

  if (!response.ok) {
    throw new Error(`CivicClerk request failed with status ${response.status}: ${url}`);
  }

  const page = (await response.json()) as CivicClerkPage;
  if (!Array.isArray(page.value)) {
    throw new Error(`CivicClerk returned a page without a meeting list: ${url}`);
  }

  return { events: page.value, nextLink: page['@odata.nextLink'] };
}

// Reads the source's events newest first, following @odata.nextLink, for at
// most maxPages pages (SRS-220.1). Each page is converted before the next one
// is fetched, and a page counts only if every event on it converted. complete
// is true only when a page with no next link is read within the bound. Pages
// left at the bound give false, with no read past it. A failed first page
// throws, since nothing was read. A later failed page or timeout is logged
// and ends the read with complete false, keeping the pages before it.
async function readEventPages<T>(
  sourceAccountId: string,
  maxPages: number,
  convert: (event: CivicClerkEvent) => T,
): Promise<{ items: T[]; complete: boolean; pagesRead: number }> {
  if (!/^[a-z0-9-]+$/i.test(sourceAccountId)) {
    throw new Error(`Invalid CivicClerk account id: "${sourceAccountId}"`);
  }

  // A bad bound is never "no bound".
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) {
    throw new Error(`Invalid page bound: ${maxPages}`);
  }

  const baseUrl = API_BASE_URL.replace('{code}', sourceAccountId);
  const apiHost = new URL(baseUrl).host;
  const visited = new Set<string>();
  const items: T[] = [];
  let pagesRead = 0;
  let nextUrl: string | undefined = `${baseUrl}/Events?$orderby=startDateTime desc`;

  while (nextUrl) {
    if (pagesRead === maxPages) {
      return { items, complete: false, pagesRead };
    }

    try {
      if (visited.has(nextUrl)) {
        throw new Error(`CivicClerk returned the same page link twice: ${nextUrl}`);
      }
      visited.add(nextUrl);

      if (new URL(nextUrl).host !== apiHost) {
        throw new Error(`CivicClerk next page link points to another host: ${nextUrl}`);
      }

      const page = await fetchEventPage(nextUrl);
      items.push(...page.events.map(convert));
      nextUrl = page.nextLink;
    } catch (error) {
      if (pagesRead === 0) {
        throw error;
      }
      console.error(`CivicClerk listing stopped after ${pagesRead} pages: ${(error as Error).message}`);
      return { items, complete: false, pagesRead };
    }

    pagesRead += 1;
  }

  return { items, complete: true, pagesRead };
}

// Returns the meetings on the first maxPages pages the source lists, newest
// first, and whether the whole list was read (SRS-220.1). Nothing is filtered
// out (SRS-220.2, SRS-220.8). Throws when the first page fails: a failed
// fetch is never "no meetings".
export async function fetchMeetings(sourceAccountId: string, maxPages: number): Promise<MeetingListing> {
  const { items, complete, pagesRead } = await readEventPages(sourceAccountId, maxPages, (event) =>
    toSourceMeeting(event, sourceAccountId),
  );

  return { meetings: items, complete, pagesRead };
}

// Returns the files each meeting lists, keyed by source meeting id, read from
// the same pages and with the same bound as fetchMeetings (SRS-208.2,
// SRS-220.1), and whether the whole list was read. A meeting with no files
// maps to an empty list. Nothing is filtered out. A meeting without a file
// list or a file without an id or name fails its page. Throws when the first
// page fails: a failed listing is never "no files".
export async function fetchMeetingFiles(sourceAccountId: string, maxPages: number): Promise<MeetingFilesListing> {
  const { items, complete, pagesRead } = await readEventPages(
    sourceAccountId,
    maxPages,
    (event): [string, SourceFile[]] => {
      const sourceMeetingId = eventId(event);
      if (!Array.isArray(event.publishedFiles)) {
        throw new Error(`CivicClerk returned meeting ${sourceMeetingId} without a file list`);
      }

      return [sourceMeetingId, event.publishedFiles.map((file) => toSourceFile(file, sourceMeetingId, sourceAccountId))];
    },
  );

  return { filesByMeeting: new Map(items), complete, pagesRead };
}

// Downloads one file's bytes and returns them with the MIME type the source
// sent (SRS-208.2). The whole body is read before anything is returned, so a
// partial file is never kept. Throws on a failed request, an empty body, a
// missing Content-Type, and a body that does not match Content-Length.
export async function downloadFile(file: SourceFile): Promise<{ bytes: Uint8Array; mimeType: string }> {
  let response: Response;
  try {
    response = await fetch(file.downloadUrl);
  } catch (error) {
    throw new Error(`CivicClerk could not be reached for file ${file.sourceFileId}: ${(error as Error).message}`);
  }

  if (!response.ok) {
    throw new Error(`CivicClerk file ${file.sourceFileId} download failed with status ${response.status}`);
  }

  const mimeType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!mimeType) {
    throw new Error(`CivicClerk returned file ${file.sourceFileId} without a Content-Type`);
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    throw new Error(`CivicClerk file ${file.sourceFileId} download did not finish: ${(error as Error).message}`);
  }

  if (bytes.length === 0) {
    throw new Error(`CivicClerk returned file ${file.sourceFileId} with an empty body`);
  }

  // A compressed response's Content-Length is not the body length.
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && !response.headers.has('content-encoding') && Number(contentLength) !== bytes.length) {
    throw new Error(
      `CivicClerk file ${file.sourceFileId} is ${bytes.length} bytes but Content-Length is ${contentLength}`,
    );
  }

  return { bytes, mimeType };
}
