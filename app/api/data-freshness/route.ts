import { getAuthenticatedUser, getToken } from '../../../lib/residentAuth';
import {
  formatCheckTime,
  getFinishedChecks,
  getFollowedTowns,
  lastSuccessfulCheckAt,
  latestCheckFailed,
} from '../../../lib/dataFreshness';

// SRS-102.1: for each followed town, the date and time of its most recent successful check.
// SRS-102.2: and whether its most recent check was not successful.

const LOAD_ERROR = 'Data freshness could not be loaded. Please try again.';

export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const towns = await getFollowedTowns(supabase!, user.id);
  if (!towns) return Response.json({ error: LOAD_ERROR }, { status: 500 });

  const freshness = [];
  for (const town of towns) {
    const checks = await getFinishedChecks(supabase!, town.town_id);
    if (!checks) return Response.json({ error: LOAD_ERROR }, { status: 500 });

    const endedAt = lastSuccessfulCheckAt(checks);
    freshness.push({
      town_id: town.town_id,
      name: town.name,
      last_successful_check: endedAt ? formatCheckTime(endedAt, town.meeting_time_zone) : null,
      latest_check_failed: latestCheckFailed(checks),
    });
  }

  return Response.json({ towns: freshness }, { status: 200 });
}