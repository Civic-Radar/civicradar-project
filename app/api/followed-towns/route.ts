import { ensureUserAccount, getAuthenticatedUser, getToken, type SupabaseClient } from '../../../lib/residentAuth';

type Town = { town_id: number; name: string };

const LOAD_ERROR = 'Your followed towns could not be loaded. Please try again.';
const SAVE_ERROR = 'Your followed towns could not be saved. Please try again.';

// Supported towns are the catalog entries still shown in selection lists.
async function getSupportedTowns(supabase: SupabaseClient): Promise<Town[] | null> {
  const { data, error } = await supabase
    .from('towns')
    .select('town_id, name')
    .is('removed_at', null)
    .order('name');

  return error ? null : ((data ?? []) as Town[]);
}

async function getFollowedTownIds(supabase: SupabaseClient, userId: string): Promise<Set<number> | null> {
  const { data, error } = await supabase
    .from('user_followed_towns')
    .select('town_id')
    .eq('user_id', userId);

  if (error) return null;
  return new Set(((data ?? []) as { town_id: number }[]).map((row) => row.town_id));
}

function markFollowed(towns: Town[], followedIds: Set<number>) {
  return towns.map((town) => ({ ...town, followed: followedIds.has(town.town_id) }));
}

export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const towns = await getSupportedTowns(supabase!);
  if (!towns) return Response.json({ error: LOAD_ERROR }, { status: 500 });

  const followedIds = await getFollowedTownIds(supabase!, user.id);
  if (!followedIds) return Response.json({ error: LOAD_ERROR }, { status: 500 });

  return Response.json({ towns: markFollowed(towns, followedIds) }, { status: 200 });
}

export async function PUT(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const submitted = (body as { town_ids?: unknown } | null)?.town_ids;
  if (!Array.isArray(submitted) || !submitted.every((id) => Number.isInteger(id) && id > 0)) {
    return Response.json({ error: 'town_ids must be a list of town ids.' }, { status: 400 });
  }
  const townIds = [...new Set(submitted as number[])];

  const towns = await getSupportedTowns(supabase!);
  if (!towns) return Response.json({ error: SAVE_ERROR }, { status: 500 });

  const supportedIds = new Set(towns.map((town) => town.town_id));
  if (!townIds.every((id) => supportedIds.has(id))) {
    return Response.json({ error: 'One or more selected towns are not available.' }, { status: 400 });
  }

  if (!(await ensureUserAccount(supabase!, user))) return Response.json({ error: SAVE_ERROR }, { status: 500 });

  // One database function swaps the whole selection in a single transaction
  // (supabase/schema.sql), so a failed or overlapping save never leaves it half-done.
  const { error: replaceError } = await supabase!.rpc('replace_followed_towns', {
    p_user_id: user.id,
    p_town_ids: townIds,
  });
  if (replaceError) return Response.json({ error: SAVE_ERROR }, { status: 500 });

  const followedIds = await getFollowedTownIds(supabase!, user.id);
  if (!followedIds) return Response.json({ error: SAVE_ERROR }, { status: 500 });

  return Response.json({ towns: markFollowed(towns, followedIds) }, { status: 200 });
}
