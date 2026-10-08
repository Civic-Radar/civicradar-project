import type { SourceMeeting } from './types';

// All CivicClerk specifics live in this file. {code} is the town's
// towns.source_account_id (e.g. Salem is "salemma").
const API_BASE_URL = 'https://{code}.api.civicclerk.com/v1';

// The API does not return a link to the meeting's public page, so it is
// derived from the CivicClerk portal address.
const PORTAL_EVENT_URL = 'https://{code}.portal.civicclerk.com/event/{id}/overview';

interface CivicClerkLocation {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
}

interface CivicClerkEvent {
  id?: number | null;
  eventName?: string | null;
  categoryId?: number | null;
  categoryName?: string | null;
  startDateTime?: string | null;
  eventLocation?: CivicClerkLocation | null;
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

function toSourceMeeting(event: CivicClerkEvent, sourceAccountId: string): SourceMeeting {
  if (event.id === null || event.id === undefined) {
    throw new Error('CivicClerk returned a meeting without an id');
  }

  const sourceMeetingId = String(event.id);

  return {
    sourceMeetingId,
    title: text(event.eventName),
    sourceBodyId: event.categoryId === null || event.categoryId === undefined ? null : String(event.categoryId),
    sourceBodyName: text(event.categoryName),
    sourceStartTime: text(event.startDateTime),
    location: joinLocation(event.eventLocation),
    onlineLink: null, // CivicClerk sends no online participation link (zoomMeetingId is not a link)
    sourceUrl: PORTAL_EVENT_URL.replace('{code}', sourceAccountId).replace('{id}', encodeURIComponent(sourceMeetingId)),
  };
}

// Returns every meeting the source lists, following @odata.nextLink until
// the last page (SRS-220.1). Nothing is filtered out (SRS-220.2, SRS-220.8).
// Throws on any failed page: a failed fetch is never "no meetings".
export async function fetchMeetings(sourceAccountId: string): Promise<SourceMeeting[]> {
  if (!/^[a-z0-9-]+$/i.test(sourceAccountId)) {
    throw new Error(`Invalid CivicClerk account id: "${sourceAccountId}"`);
  }

  const baseUrl = API_BASE_URL.replace('{code}', sourceAccountId);
  const apiHost = new URL(baseUrl).host;
  const meetings: SourceMeeting[] = [];
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

    for (const event of page.value) {
      meetings.push(toSourceMeeting(event, sourceAccountId));
    }

    const nextLink = page['@odata.nextLink'];
    if (nextLink && new URL(nextLink).host !== apiHost) {
      throw new Error(`CivicClerk next page link points to another host: ${nextLink}`);
    }
    nextUrl = nextLink;
  }

  return meetings;
}
