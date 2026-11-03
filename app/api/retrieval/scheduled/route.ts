import { getSupabaseClient } from '../../../../lib/supabase';
import { retrievalMaxPages } from '../../../../lib/retrieval/maxPages';
import { runAllTownChecks } from '../../../../lib/retrieval/runAllTownChecks';
import { tagPendingMeetings } from '../../../../lib/tagPendingMeetings';
import {
  getScheduleSecret,
  isValidScheduleSecret,
  RETRIEVAL_SCHEDULE_SECRET_HEADER,
} from '../../../../lib/retrieval/scheduleSecret';

// The scheduled check (SRS-208.1), called by the GitHub workflow with the
// x-retrieval-schedule-secret header, no sign-in. It checks every supported
// town with the server's page bound and answers with counts only. It reads no
// body and no query value, so a caller can never choose a town or raise the
// bound.
export async function POST(request: Request) {
  if (!getScheduleSecret()) {
    return Response.json({ error: 'The scheduled check is not configured.' }, { status: 500 });
  }

  if (!isValidScheduleSecret(request.headers.get(RETRIEVAL_SCHEDULE_SECRET_HEADER))) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  // Retrieval writes need the service role key (RLS is deny-by-default), and
  // getSupabaseClient() would otherwise fall back to the anon key.
  const supabase = process.env.SUPABASE_SERVICE_ROLE_KEY ? getSupabaseClient() : null;
  if (!supabase) {
    return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  }

  const result = await runAllTownChecks(supabase, { maxPages: retrievalMaxPages() });

  if (!result.ok) {
    return Response.json({ error: 'Could not read the town list.' }, { status: 500 });
  }

  // Tags the meetings whose agenda text is new or changed, now that this
  // check has saved it (Task 401.4-7). null when they could not be read.
  const tagging = await tagPendingMeetings(supabase);

  return Response.json({ towns: result.towns, totals: result.totals, tagging }, { status: 200 });
}
