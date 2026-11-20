import { getAuthenticatedUser, getToken } from '../../../../../lib/residentAuth';
import {
  LAST_ADMINISTRATOR_ERROR,
  LOAD_ERROR,
  MEMBER_MANAGEMENT_ERROR,
  PERMISSION_ASSIGNMENT_ERROR,
  PERMISSION_LEVELS,
  administratorCount,
  getMembers,
  getMembership,
  hasMemberManagementPermission,
  type PermissionLevel,
} from '../../../../../lib/organizations';

// SRS-103.2: an organization administrator assigns a member a new permission level.
const SAVE_ERROR = 'The permission level could not be saved. Please try again.';

export async function PATCH(request: Request, { params }: { params: { userId: string } }) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const membership = await getMembership(supabase!, user.id);
  if (membership === undefined) return Response.json({ error: LOAD_ERROR }, { status: 500 });
  if (membership === null || membership.permission_level !== 'Administrator') {
    return Response.json({ error: PERMISSION_ASSIGNMENT_ERROR }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const level = body?.permission_level as PermissionLevel;
  if (!PERMISSION_LEVELS.includes(level)) {
    return Response.json({ error: 'Permission level must be Member or Administrator.' }, { status: 400 });
  }

  const members = await getMembers(supabase!, membership.organization_id);
  if (!members) return Response.json({ error: LOAD_ERROR }, { status: 500 });

  // Only members of the administrator's own organization can be changed.
  const target = members.find((member) => member.user_id === params.userId);
  if (!target) return Response.json({ error: 'Member not found.' }, { status: 404 });

  if (target.permission_level === 'Administrator' && level === 'Member' && administratorCount(members) === 1) {
    return Response.json({ error: LAST_ADMINISTRATOR_ERROR }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from('organization_members')
    .update({ permission_level: level })
    .eq('organization_id', membership.organization_id)
    .eq('user_id', target.user_id)
    .select('user_id, permission_level')
    .maybeSingle();
  if (error || !data) return Response.json({ error: SAVE_ERROR }, { status: 500 });

  return Response.json({ member: { ...target, permission_level: level } }, { status: 200 });
}

// SRS-103.3: an organization administrator removes a member. Anyone else is
// denied and the member list is unchanged.
export async function DELETE(request: Request, { params }: { params: { userId: string } }) {
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

  const members = await getMembers(supabase!, membership.organization_id);
  if (!members) return Response.json({ error: LOAD_ERROR }, { status: 500 });

  // Only members of the administrator's own organization can be removed.
  const target = members.find((member) => member.user_id === params.userId);
  if (!target) return Response.json({ error: 'Member not found.' }, { status: 404 });

  if (target.permission_level === 'Administrator' && administratorCount(members) === 1) {
    return Response.json({ error: LAST_ADMINISTRATOR_ERROR }, { status: 400 });
  }

  const { error } = await supabase!
    .from('organization_members')
    .delete()
    .eq('organization_id', membership.organization_id)
    .eq('user_id', target.user_id);
  if (error) return Response.json({ error: 'The member could not be removed. Please try again.' }, { status: 500 });

  return Response.json({ removed: target }, { status: 200 });
}
