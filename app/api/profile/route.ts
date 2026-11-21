import { getSupabaseClient } from '../../../lib/supabase';
import { withAvatarLink } from '../../../lib/avatarLink';

// Fixed messages (#757): the database error is logged, never sent.
const LOAD_ERROR = 'Your profile could not be loaded. Please try again.';
const CREATE_ERROR = 'Your profile could not be created. Please try again.';
const SAVE_ERROR = 'Your profile could not be saved. Please try again.';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

async function getAuthenticatedUser(token: string) {
  const supabase = getSupabaseClient();
  if (!supabase) return { user: null, supabase: null, configError: true };

  const { data: { user }, error } = await supabase.auth.getUser(token);
  return { user: error ? null : user, supabase, configError: false };
}

export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { data, error } = await supabase!
    .from('myapp_profile')
    .select('id, username, biography, avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error(`Profile read failed: ${error.message}`);
    return Response.json({ error: LOAD_ERROR }, { status: 500 });
  }

  return Response.json({ profile: data ? withAvatarLink(data) : null }, { status: 200 });
}

export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const body = await request.json();
  const { username, biography } = body as { username?: string; biography?: string };

  if (!username) return Response.json({ error: 'username is required.' }, { status: 400 });

  const { data, error } = await supabase!
    .from('myapp_profile')
    .insert({ id: user.id, username, biography: biography ?? '' })
    .select('id, username, biography, avatar_url')
    .single();

  if (error) {
    console.error(`Profile create failed: ${error.message}`);
    return Response.json({ error: CREATE_ERROR }, { status: 400 });
  }

  return Response.json({ profile: withAvatarLink(data) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const body = await request.json();
  const { biography } = body as { biography?: string };

  if (biography === undefined) return Response.json({ error: 'biography is required.' }, { status: 400 });

  const { data, error } = await supabase!
    .from('myapp_profile')
    .update({ biography })
    .eq('id', user.id)
    .select('id, username, biography, avatar_url')
    .single();

  if (error) {
    console.error(`Profile biography save failed: ${error.message}`);
    return Response.json({ error: SAVE_ERROR }, { status: 400 });
  }

  return Response.json({ profile: withAvatarLink(data) }, { status: 200 });
}
