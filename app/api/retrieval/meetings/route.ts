import { getSupabaseClient } from '../../../../lib/supabase';
import { downloadFile, fetchMeetingFiles, fetchMeetings } from '../../../../lib/sources/civicclerk';
import { saveMeetings } from '../../../../lib/retrieval/saveMeetings';
import { retrieveDocuments } from '../../../../lib/retrieval/retrieveDocuments';
import type { MeetingFilesListing, MeetingListing } from '../../../../lib/sources/types';

// Used when RETRIEVAL_MAX_PAGES is unset or invalid, so a missing setting can
// never mean unlimited (SRS-220.1).
const DEFAULT_MAX_PAGES = 2;
const RETRIEVAL_MAX_PAGES_CEILING = 5;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

// The page bound for both source passes, read from the server setting only,
// never from the request.
function retrievalMaxPages(): number {
  const setting = process.env.RETRIEVAL_MAX_PAGES?.trim() ?? '';
  const value = /^\d+$/.test(setting) ? Number(setting) : 0;

  return value < 1 ? DEFAULT_MAX_PAGES : Math.min(value, RETRIEVAL_MAX_PAGES_CEILING);
}

// Retrieves a town's meetings from its source and saves them (SRS-220.3),
// then stores each file listed under them as a document (SRS-208.2). Both
// passes read at most the page bound. The meetings and files from every page
// read are kept, even when a later page fails, and complete is true only when
// both passes read the whole list (SRS-220.1). Nothing is written for the
// flag yet (SRS-222.2). No access control yet: any caller can trigger a
// retrieval run.
export async function POST(request: Request) {
  let townId: unknown;
  try {
    ({ townId } = (await request.json()) as { townId?: unknown });
  } catch {
    return Response.json({ error: 'Request body must be JSON with a townId.' }, { status: 400 });
  }

  if (typeof townId !== 'number' || !Number.isSafeInteger(townId) || townId < 0) {
    return Response.json({ error: 'townId must be a whole number.' }, { status: 400 });
  }

  // Retrieval writes need the service role key (RLS is deny-by-default).
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'The Supabase service role key is not configured.' }, { status: 500 });
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  }

  const { data: town, error: townError } = await supabase
    .from('towns')
    .select('town_id, source_account_id, meeting_time_zone')
    .eq('town_id', townId)
    .is('removed_at', null)
    .maybeSingle();

  if (townError) {
    return Response.json({ error: `Could not read town: ${townError.message}` }, { status: 500 });
  }

  if (!town) {
    return Response.json({ error: `Town ${townId} was not found.` }, { status: 404 });
  }

  const maxPages = retrievalMaxPages();

  // A failed fetch is never "no meetings": any client error stops the run.
  let meetingListing: MeetingListing;
  try {
    meetingListing = await fetchMeetings(town.source_account_id, maxPages);
  } catch (error: unknown) {
    return Response.json({ error: errorMessage(error) }, { status: 502 });
  }

  let saved: number;
  try {
    saved = await saveMeetings(supabase, town, meetingListing.meetings);
  } catch (error: unknown) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }

  // A failed listing is never "no files". Details stay in the server log.
  let fileListing: MeetingFilesListing;
  try {
    fileListing = await fetchMeetingFiles(town.source_account_id, maxPages);
  } catch (error: unknown) {
    console.error(`Document retrieval: town ${town.town_id} file listing failed: ${errorMessage(error)}`);
    return Response.json(
      { error: `Saved ${saved} meetings, but listing their documents failed.` },
      { status: 502 },
    );
  }

  const complete = meetingListing.complete && fileListing.complete;
  console.log(
    `Meeting retrieval: town ${town.town_id} read ${meetingListing.pagesRead} meeting pages and ${fileListing.pagesRead} file pages, bound ${maxPages}, complete ${complete}`,
  );

  // Per-file failures are logged inside and never stop the run (SRS-208.2).
  try {
    await retrieveDocuments(supabase, town.town_id, fileListing.filesByMeeting, downloadFile);
  } catch (error: unknown) {
    console.error(`Document retrieval: town ${town.town_id} failed: ${errorMessage(error)}`);
    return Response.json(
      { error: `Saved ${saved} meetings, but retrieving their documents failed.` },
      { status: 500 },
    );
  }

  return Response.json({ saved, complete }, { status: 200 });
}
