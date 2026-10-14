import type { SourceFile, SourceMeeting } from './types';

// All CivicClerk specifics live in this file. {code} is the town's
// towns.source_account_id (e.g. Salem is "salemma").
const API_BASE_URL = 'https://{code}.api.civicclerk.com/v1';

// The API does not return a link to the meeting's public page, so it is
// derived from the CivicClerk portal address.
const PORTAL_EVENT_URL = 'https://{code}.portal.civicclerk.com/event/{id}/overview';

// File bytes are streamed by file id. The relative `url` on a published file
// is not used.
const FILE_STREAM_URL = `${API_BASE_URL}/Meetings/GetMeetingFileStream(fileId={id},plainText=false)`;

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

function toSourceFile(file: CivicClerkPublishedFile, sourceMeetingId: string, sourceAccountId: string): SourceFile {
  if (file.fileId === null || file.fileId === undefined) {
    throw new Error(`CivicClerk returned a file without an id under meeting ${sourceMeetingId}`);
  }

  const sourceFileId = String(file.fileId);
  const fileName = text(file.name);
  if (fileName === null) {
    throw new Error(`CivicClerk returned file ${sourceFileId} without a name under meeting ${sourceMeetingId}`);
  }

  return {
    sourceFileId,
    fileName,
    sourceFileType: text(file.type),
    downloadUrl: FILE_STREAM_URL.replace('{code}', sourceAccountId).replace('{id}', encodeURIComponent(sourceFileId)),
    sourcePageUrl: portalEventUrl(sourceAccountId, sourceMeetingId), // no per-file page; the meeting's page for now
    sizeBytes: null, // CivicClerk sends no file size
  };
}

// Yields every event the source lists, following @odata.nextLink until the
// last page. A page is fetched only after the caller has consumed the one
// before it. Throws on any failed page.
async function* fetchEvents(sourceAccountId: string): AsyncGenerator<CivicClerkEvent> {
  if (!/^[a-z0-9-]+$/i.test(sourceAccountId)) {
    throw new Error(`Invalid CivicClerk account id: "${sourceAccountId}"`);
  }

  const baseUrl = API_BASE_URL.replace('{code}', sourceAccountId);
  const apiHost = new URL(baseUrl).host;
  const visited = new Set<string>();
  let nextUrl: string | undefined = `${baseUrl}/Events?$orderby=startDateTime desc`;

  while (nextUrl) {
    if (visited.has(nextUrl)) {
      throw new Error(`CivicClerk returned the same page link twice: ${nextUrl}`);
    }
    visited.add(nextUrl);

    let response: Response;
    try {
      response = await fetch(nextUrl, { headers: { Accept: 'application/json' } });
    } catch (error) {
      throw new Error(`CivicClerk could not be reached: ${(error as Error).message}`);
    }

    if (!response.ok) {
      throw new Error(`CivicClerk request failed with status ${response.status}: ${nextUrl}`);
    }

    const page = (await response.json()) as CivicClerkPage;
    if (!Array.isArray(page.value)) {
      throw new Error(`CivicClerk returned a page without a meeting list: ${nextUrl}`);
    }

    yield* page.value;

    const nextLink = page['@odata.nextLink'];
    if (nextLink && new URL(nextLink).host !== apiHost) {
      throw new Error(`CivicClerk next page link points to another host: ${nextLink}`);
    }
    nextUrl = nextLink;
  }
}

// Returns every meeting the source lists, following @odata.nextLink until
// the last page (SRS-220.1). Nothing is filtered out (SRS-220.2, SRS-220.8).
// Throws on any failed page: a failed fetch is never "no meetings".
export async function fetchMeetings(sourceAccountId: string): Promise<SourceMeeting[]> {
  const meetings: SourceMeeting[] = [];

  for await (const event of fetchEvents(sourceAccountId)) {
    meetings.push(toSourceMeeting(event, sourceAccountId));
  }

  return meetings;
}

// Returns the files each meeting lists, keyed by source meeting id, read from
// the same pages as fetchMeetings (SRS-208.2). A meeting with no files maps
// to an empty list. Nothing is filtered out. Throws on any failed page, on a
// meeting without a file list, and on a file without an id or name: a failed
// listing is never "no files".
export async function fetchMeetingFiles(sourceAccountId: string): Promise<Map<string, SourceFile[]>> {
  const filesByMeeting = new Map<string, SourceFile[]>();

  for await (const event of fetchEvents(sourceAccountId)) {
    const sourceMeetingId = eventId(event);
    if (!Array.isArray(event.publishedFiles)) {
      throw new Error(`CivicClerk returned meeting ${sourceMeetingId} without a file list`);
    }

    filesByMeeting.set(
      sourceMeetingId,
      event.publishedFiles.map((file) => toSourceFile(file, sourceMeetingId, sourceAccountId)),
    );
  }

  return filesByMeeting;
}
