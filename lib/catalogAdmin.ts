// SRS-104.1, KJ, Catalog management access
// Only an account with the exact role "System administrator" may manage the catalog.
import type { getSupabaseClient } from './supabase';

type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseClient>>;

export const ADMIN_ROLE = 'System administrator';
export const ADMIN_ONLY_ERROR = 'Only a system administrator can manage the catalog.';
export const ROLE_CHECK_ERROR = 'Your access could not be checked.';

// true for a system administrator, false for anyone else, null if the role could not be read.
export async function isSystemAdministrator(supabase: SupabaseClient, userId: string): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('user_accounts')
    .select('account_role')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return null;
  return (data as { account_role?: unknown } | null)?.account_role === ADMIN_ROLE;
}