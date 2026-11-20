import { getAuthenticatedUser, getToken } from '../../../../lib/residentAuth';
import { LOAD_ERROR, getMembers, getMembership } from '../../../../lib/organizations';

// SRS-103.1: the organization member list, with each member's permission level.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const membership = await getMembership(supabase!, user.id);
  if (membership === undefined) return Response.json({ error: LOAD_ERROR }, { status: 500 });
  if (membership === null) {
    return Response.json({ organization: null, my_user_id: user.id, my_permission_level: null, members: [] }, { status: 200 });
  }

  const { data: organization, error } = await supabase!
    .from('organizations')
    .select('organization_id, name')
    .eq('organization_id', membership.organization_id)
    .maybeSingle();
  if (error || !organization) return Response.json({ error: LOAD_ERROR }, { status: 500 });

  const members = await getMembers(supabase!, membership.organization_id);
  if (!members) return Response.json({ error: LOAD_ERROR }, { status: 500 });

  return Response.json(
    { organization, my_user_id: user.id, my_permission_level: membership.permission_level, members },
    { status: 200 },
  );
}
