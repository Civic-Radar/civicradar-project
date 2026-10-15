import { getSupabaseClient } from '../../../../lib/supabase';
import { downloadFile, fetchMeetingFiles, fetchMeetings } from '../../../../lib/sources/civicclerk';
import { saveMeetings } from '../../../../lib/retrieval/saveMeetings';
import { retrieveDocuments } from '../../../../lib/retrieval/retrieveDocuments';
import type { SourceFile, SourceMeeting } from '../../../../lib/sources/types';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

// Retrieves a town's meetings from its source and saves them (SRS-220.3),
// then stores each file listed under them as a document (SRS-208.2).
// No access control yet: any caller can trigger a retrieval run.
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

  // A failed fetch is never "no meetings": any client error stops the run.
  let meetings: SourceMeeting[];
  try {
    meetings = await fetchMeetings(town.source_account_id);
  } catch (error: unknown) {
    return Response.json({ error: errorMessage(error) }, { status: 502 });
  }

  let saved: number;
  try {
    saved = await saveMeetings(supabase, town, meetings);
  } catch (error: unknown) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }

  // A failed listing is never "no files". Details stay in the server log.
  let filesByMeeting: Map<string, SourceFile[]>;
  try {
    filesByMeeting = await fetchMeetingFiles(town.source_account_id);
  } catch (error: unknown) {
    console.error(`Document retrieval: town ${town.town_id} file listing failed: ${errorMessage(error)}`);
    return Response.json(
      { error: `Saved ${saved} meetings, but listing their documents failed.` },
      { status: 502 },
    );
  }

  // Per-file failures are logged inside and never stop the run (SRS-208.2).
  try {
    await retrieveDocuments(supabase, town.town_id, filesByMeeting, downloadFile);
  } catch (error: unknown) {
    console.error(`Document retrieval: town ${town.town_id} failed: ${errorMessage(error)}`);
    return Response.json(
      { error: `Saved ${saved} meetings, but retrieving their documents failed.` },
      { status: 500 },
    );
  }

  return Response.json({ saved }, { status: 200 });
}
