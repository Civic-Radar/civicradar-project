import { getSupabaseClient } from '../../../lib/supabase';
import { ADMIN_ONLY_ERROR, ROLE_CHECK_ERROR, isSystemAdministrator } from '../../../lib/catalogAdmin';

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  // Topics still shown in selection lists, in catalog order.
  const { data, error } = await supabase
    .from('topics')
    .select('topic_id, name')
    .is('removed_at', null)
    .order('topic_id');

  if (error) return Response.json({ error: 'Topics could not be loaded. Please try again.' }, { status: 500 });

  return Response.json({ topics: data ?? [] }, { status: 200 });
}

// SRS-104.2: a system administrator adds a topic to the catalog. The topic name is required.
export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const isAdmin = await isSystemAdministrator(supabase, user.id);
  if (isAdmin === null) return Response.json({ error: ROLE_CHECK_ERROR }, { status: 500 });
  if (!isAdmin) return Response.json({ error: ADMIN_ONLY_ERROR }, { status: 403 });

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return Response.json({ error: 'Topic name is required.', missingFields: ['name'] }, { status: 400 });
  }
  if (name.length > 100) {
    return Response.json({ error: 'Topic name must be 100 characters or fewer.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('topics')
    .insert({ name })
    .select('topic_id, name')
    .single();

  if (error) {
    // 23505 = the active topic name is already taken (topics_active_name_uq).
    if (error.code === '23505') {
      return Response.json({ error: `A topic named "${name}" already exists.` }, { status: 400 });
    }
    return Response.json({ error: 'The topic could not be saved. Please try again.' }, { status: 500 });
  }

  return Response.json({ topic: data }, { status: 201 });
}