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

  const { data, error } = await supabase
    .from('user_accounts')
    .select('setup_status')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return Response.json({ error: 'Setup status could not be loaded.' }, { status: 500 });

  // Registration only creates the auth user, so a missing account row means setup has not started.
  const setupStatus: string = data?.setup_status ?? 'Not started';

  return Response.json({ setup_status: setupStatus, needs_setup: setupStatus === 'Not started' }, { status: 200 });
}

// SRS-107.3: mark first-time setup as skipped so the user is not sent to setup again.
// SRS-107.4: mark first-time setup as completed after the user saves their topics.
export async function PATCH(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const setupStatus = body?.setup_status;
  if (setupStatus !== 'Skipped' && setupStatus !== 'Completed') {
    return Response.json({ error: 'setup_status must be "Skipped" or "Completed".' }, { status: 400 });
  }

  // The user_accounts row may not exist yet, so upsert it.
  const { error } = await supabase
    .from('user_accounts')
    .upsert({ user_id: user.id, email: user.email, setup_status: setupStatus }, { onConflict: 'user_id' });

  if (error) return Response.json({ error: 'Setup status could not be saved.' }, { status: 500 });

  return Response.json({ setup_status: setupStatus, needs_setup: false }, { status: 200 });
}