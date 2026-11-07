import { getSupabaseClient } from '../../../../lib/supabase';
import { ADMIN_ONLY_ERROR, ROLE_CHECK_ERROR, isSystemAdministrator } from '../../../../lib/catalogAdmin';

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

// SRS-104.3: a system administrator renames a topic. Follows and meeting tags point at topic_id,
// so they stay attached to the renamed topic.
export async function PATCH(request: Request, { params }: { params: { topicId: string } }) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const isAdmin = await isSystemAdministrator(supabase!, user.id);
  if (isAdmin === null) return Response.json({ error: ROLE_CHECK_ERROR }, { status: 500 });
  if (!isAdmin) return Response.json({ error: ADMIN_ONLY_ERROR }, { status: 403 });

  const topicId = Number(params.topicId);
  if (!Number.isInteger(topicId) || topicId <= 0) {
    return Response.json({ error: 'Invalid topic id.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return Response.json({ error: 'Topic name is required.', missingFields: ['name'] }, { status: 400 });
  }
  if (name.length > 100) {
    return Response.json({ error: 'Topic name must be 100 characters or fewer.' }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from('topics')
    .update({ name })
    .eq('topic_id', topicId)
    .is('removed_at', null)
    .select('topic_id, name')
    .maybeSingle();

  if (error) {
    // 23505 = another active topic already has this name (topics_active_name_uq).
    if (error.code === '23505') {
      return Response.json({ error: `A topic named "${name}" already exists.` }, { status: 400 });
    }
    return Response.json({ error: 'The topic could not be saved. Please try again.' }, { status: 500 });
  }
  if (!data) return Response.json({ error: 'Topic not found.' }, { status: 404 });

  return Response.json({ topic: data }, { status: 200 });
}

// SRS-104.4: remove a topic from every resident selection list after the administrator confirms.
// The row is kept and removed_at hides it, so follows and meeting tags that reference it are not lost.
export async function DELETE(request: Request, { params }: { params: { topicId: string } }) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const isAdmin = await isSystemAdministrator(supabase!, user.id);
  if (isAdmin === null) return Response.json({ error: ROLE_CHECK_ERROR }, { status: 500 });
  if (!isAdmin) return Response.json({ error: ADMIN_ONLY_ERROR }, { status: 403 });

  const topicId = Number(params.topicId);
  if (!Number.isInteger(topicId) || topicId <= 0) {
    return Response.json({ error: 'Invalid topic id.' }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from('topics')
    .update({ removed_at: new Date().toISOString() })
    .eq('topic_id', topicId)
    .is('removed_at', null)
    .select('topic_id, name')
    .maybeSingle();

  if (error) return Response.json({ error: 'The topic could not be removed. Please try again.' }, { status: 500 });
  if (!data) return Response.json({ error: 'Topic not found.' }, { status: 404 });

  return Response.json({ removed: data }, { status: 200 });
}