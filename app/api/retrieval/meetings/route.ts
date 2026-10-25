import { getAuthenticatedUser, getToken, type SupabaseClient } from '../../../../lib/residentAuth';
import { downloadFile, fetchMeetingFiles, fetchMeetings } from '../../../../lib/sources/civicclerk';
import { saveMeetings } from '../../../../lib/retrieval/saveMeetings';
import { retrieveDocuments } from '../../../../lib/retrieval/retrieveDocuments';
import type { MeetingFilesListing, MeetingListing } from '../../../../lib/sources/types';

// Used when RETRIEVAL_MAX_PAGES is unset or invalid, so a missing setting can
// never mean unlimited (SRS-220.1).
const DEFAULT_MAX_PAGES = 2;
const RETRIEVAL_MAX_PAGES_CEILING = 5;

const ADMIN_ROLE = 'System administrator';

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

// Only the exact administrator role passes. A missing row or any other value
// is not an administrator; null means the role could not be read.
async function isSystemAdministrator(supabase: SupabaseClient, userId: string): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('user_accounts')
    .select('account_role')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return null;
  return (data as { account_role?: unknown } | null)?.account_role === ADMIN_ROLE;
}

// Retrieves a town's meetings from its source and saves them (SRS-220.3),
// then stores each file listed under them as a document (SRS-208.2). Both
// passes read at most the page bound. The meetings and files from every page
// read are kept, even when a later page fails, and complete is true only when
// both passes read the whole list (SRS-220.1). Nothing is written for the
// flag yet (SRS-222.2). Only a signed-in system administrator can trigger a
// retrieval run, and that is checked before anything else.
export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Also checks the service role key, which retrieval writes need (RLS is
  // deny-by-default).
  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const isAdmin = await isSystemAdministrator(supabase!, user.id);
  if (isAdmin === null) return Response.json({ error: 'Your access could not be checked.' }, { status: 500 });
  if (!isAdmin) return Response.json({ error: 'Only a system administrator can run retrieval.' }, { status: 403 });

  let townId: unknown;
  try {
    ({ townId } = (await request.json()) as { townId?: unknown });
  } catch {
    return Response.json({ error: 'Request body must be JSON with a townId.' }, { status: 400 });
  }

  if (typeof townId !== 'number' || !Number.isSafeInteger(townId) || townId < 0) {
    return Response.json({ error: 'townId must be a whole number.' }, { status: 400 });
  }

  const { data: town, error: townError } = await supabase!
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
    saved = await saveMeetings(supabase!, town, meetingListing.meetings);
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
    await retrieveDocuments(supabase!, town.town_id, fileListing.filesByMeeting, downloadFile);
  } catch (error: unknown) {
    console.error(`Document retrieval: town ${town.town_id} failed: ${errorMessage(error)}`);
    return Response.json(
      { error: `Saved ${saved} meetings, but retrieving their documents failed.` },
      { status: 500 },
    );
  }

  return Response.json({ saved, complete }, { status: 200 });
}
