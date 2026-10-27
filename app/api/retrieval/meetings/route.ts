import { getAuthenticatedUser, getToken, type SupabaseClient } from '../../../../lib/residentAuth';
import { downloadFile, fetchAgendaItems, fetchMeetingFiles, fetchMeetings } from '../../../../lib/sources/civicclerk';
import { runTownRetrieval } from '../../../../lib/retrieval/runTownRetrieval';

// Used when RETRIEVAL_MAX_PAGES is unset or invalid, so a missing setting can
// never mean unlimited (SRS-220.1).
const DEFAULT_MAX_PAGES = 2;
const RETRIEVAL_MAX_PAGES_CEILING = 5;

const ADMIN_ROLE = 'System administrator';

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

// Runs one retrieval run for the requested town through runTownRetrieval,
// which records the town's check (SRS-222.1), saves its meetings (SRS-220.3)
// and stores their files as documents (SRS-208.2). Only a signed-in system
// administrator can trigger a retrieval run, and that is checked before
// anything else.
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
    .select('town_id, source_account_id, meeting_time_zone, provides_agenda_items')
    .eq('town_id', townId)
    .is('removed_at', null)
    .maybeSingle();

  if (townError) {
    return Response.json({ error: `Could not read town: ${townError.message}` }, { status: 500 });
  }

  if (!town) {
    return Response.json({ error: `Town ${townId} was not found.` }, { status: 404 });
  }

  const result = await runTownRetrieval(
    supabase!,
    town,
    { fetchMeetings, fetchMeetingFiles, fetchAgendaItems, downloadFile },
    { maxPages: retrievalMaxPages() },
  );

  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({ saved: result.saved, complete: result.complete }, { status: 200 });
}
