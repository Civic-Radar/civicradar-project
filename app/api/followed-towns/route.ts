import { getSupabaseClient } from '../../../lib/supabase';

type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseClient>>;
type Town = { town_id: number; name: string };

const LOAD_ERROR = 'Your followed towns could not be loaded. Please try again.';
const SAVE_ERROR = 'Your followed towns could not be saved. Please try again.';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

async function getAuthenticatedUser(token: string) {
  // The tables used here have Row Level Security with no policies, so only the
  // service-role key can read or write them. getSupabaseClient() falls back to
  // the anon key, which would return empty results instead of an error.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { user: null, supabase: null, configError: true };

  const supabase = getSupabaseClient();
  if (!supabase) return { user: null, supabase: null, configError: true };

  const { data: { user }, error } = await supabase.auth.getUser(token);
  return { user: error ? null : user, supabase, configError: false };
}

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

  if (!user.email) return Response.json({ error: SAVE_ERROR }, { status: 500 });

  // user_followed_towns.user_id references user_accounts, and registration only
  // creates the auth user. An existing account row is left untouched.
  const { error: accountError } = await supabase!
    .from('user_accounts')
    .upsert({ user_id: user.id, email: user.email }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (accountError) return Response.json({ error: SAVE_ERROR }, { status: 500 });

  // Add before removing: there is no transaction here, so a failure part-way
  // leaves extra towns followed instead of wiping the resident's selection.
  if (townIds.length > 0) {
    const { error: addError } = await supabase!
      .from('user_followed_towns')
      .upsert(
        townIds.map((town_id) => ({ user_id: user.id, town_id })),
        { onConflict: 'user_id,town_id', ignoreDuplicates: true },
      );
    if (addError) return Response.json({ error: SAVE_ERROR }, { status: 500 });
  }

  const removal = supabase!.from('user_followed_towns').delete().eq('user_id', user.id);
  const { error: removeError } =
    townIds.length > 0 ? await removal.not('town_id', 'in', `(${townIds.join(',')})`) : await removal;
  if (removeError) return Response.json({ error: SAVE_ERROR }, { status: 500 });

  const followedIds = await getFollowedTownIds(supabase!, user.id);
  if (!followedIds) return Response.json({ error: SAVE_ERROR }, { status: 500 });

  return Response.json({ towns: markFollowed(towns, followedIds) }, { status: 200 });
}
