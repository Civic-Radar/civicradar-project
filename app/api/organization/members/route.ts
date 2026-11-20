import { getAuthenticatedUser, getToken } from '../../../../lib/residentAuth';
import {
  LOAD_ERROR,
  MEMBER_MANAGEMENT_ERROR,
  getMembers,
  getMembership,
  hasMemberManagementPermission,
} from '../../../../lib/organizations';

// SRS-103.1: the organization member list, with each member's permission level.
// SRS-103.3: adding a member needs the member-management permission.
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

// SRS-103.3: an organization administrator adds an existing Civic Radar account,
// by email, as a Member. Anyone else is denied and the member list is unchanged.
export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const membership = await getMembership(supabase!, user.id);
  if (membership === undefined) return Response.json({ error: LOAD_ERROR }, { status: 500 });
  if (!hasMemberManagementPermission(membership)) {
    return Response.json({ error: MEMBER_MANAGEMENT_ERROR }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email) return Response.json({ error: 'Email is required.', missingFields: ['email'] }, { status: 400 });

  const { data: account, error: accountError } = await supabase!
    .from('user_accounts')
    .select('user_id, email')
    .eq('email', email)
    .maybeSingle();
  if (accountError) return Response.json({ error: LOAD_ERROR }, { status: 500 });
  if (!account) return Response.json({ error: 'No Civic Radar account uses that email.' }, { status: 404 });

  const { error } = await supabase!
    .from('organization_members')
    .insert({ organization_id: membership.organization_id, user_id: account.user_id, permission_level: 'Member' });
  if (error) {
    // 23505: a user belongs to at most one organization (organization_members.user_id is unique).
    if (error.code === '23505') {
      return Response.json({ error: 'That account already belongs to an organization.' }, { status: 400 });
    }
    return Response.json({ error: 'The member could not be added. Please try again.' }, { status: 500 });
  }

  return Response.json(
    { member: { user_id: account.user_id, email: account.email, permission_level: 'Member' } },
    { status: 201 },
  );
}
