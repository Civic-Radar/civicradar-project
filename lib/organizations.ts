import type { SupabaseClient } from './residentAuth';

// SRS-103.x: organization members and their permission levels.
// An Administrator holds the member-management permission (SRS-103.3) and the
// settings permission (SRS-103.4); a Member holds neither.

export const PERMISSION_LEVELS = ['Member', 'Administrator'] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export type Membership = { organization_id: number; permission_level: PermissionLevel };
export type OrganizationMember = { user_id: string; email: string; permission_level: PermissionLevel };

export const LOAD_ERROR = 'The organization could not be loaded. Please try again.';

// The organization the user belongs to (a user belongs to at most one), null when
// they belong to none, or undefined when it could not be read.
export async function getMembership(supabase: SupabaseClient, userId: string): Promise<Membership | null | undefined> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('organization_id, permission_level')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return undefined;
  return (data as Membership | null) ?? null;
}

// Every member of the organization with their email, Administrators first, then by email.
export async function getMembers(supabase: SupabaseClient, organizationId: number): Promise<OrganizationMember[] | null> {
  const { data, error } = await supabase
    .from('organization_members')
    .select('user_id, permission_level, user_accounts(email)')
    .eq('organization_id', organizationId);
  if (error) return null;

  type Row = { user_id: string; permission_level: PermissionLevel; user_accounts: { email: string } | { email: string }[] | null };
  const members = ((data ?? []) as Row[]).map((row) => {
    const account = Array.isArray(row.user_accounts) ? row.user_accounts[0] : row.user_accounts;
    return { user_id: row.user_id, email: account?.email ?? '', permission_level: row.permission_level };
  });
  return members.sort((a, b) =>
    a.permission_level === b.permission_level
      ? a.email.localeCompare(b.email)
      : a.permission_level === 'Administrator' ? -1 : 1,
  );
}

// SRS-103.2 and SRS-103.3: changing who is an Administrator, or removing one,
// must leave the organization with at least one Administrator.
export const LAST_ADMINISTRATOR_ERROR = 'An organization needs at least one Administrator.';
export const PERMISSION_ASSIGNMENT_ERROR = 'Only an organization administrator can change permission levels.';

export function administratorCount(members: { permission_level: PermissionLevel }[]): number {
  return members.filter((member) => member.permission_level === 'Administrator').length;
}
