import { getAuthenticatedUser, getToken, type SupabaseClient } from '../../../lib/residentAuth';

// Same exact-match rule as the retrieval route's isSystemAdministrator
// (app/api/retrieval/meetings/route.ts). Kept as a copy for now.
const ADMIN_ROLE = 'System administrator';

const ROLE_ERROR = 'Your access could not be checked.';

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

// Read only: tells the client whether the signed-in user is a system
// administrator, so the retrieval link and page show only for them (SRS-220.3).
// The retrieval route still enforces the role itself.
export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const isAdmin = await isSystemAdministrator(supabase!, user.id);
  if (isAdmin === null) return Response.json({ error: ROLE_ERROR }, { status: 500 });

  return Response.json({ is_system_administrator: isAdmin }, { status: 200 });
}
