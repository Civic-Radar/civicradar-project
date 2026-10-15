import { getSupabaseClient } from '../../../lib/supabase';

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