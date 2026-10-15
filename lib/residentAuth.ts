import type { User } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase';

export type SupabaseClient = NonNullable<ReturnType<typeof getSupabaseClient>>;

export function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

export async function getAuthenticatedUser(token: string) {
  // The tables used here have Row Level Security with no policies, so only the
  // service-role key can read or write them. getSupabaseClient() falls back to
  // the anon key, which would return empty results instead of an error.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { user: null, supabase: null, configError: true };

  const supabase = getSupabaseClient();
  if (!supabase) return { user: null, supabase: null, configError: true };

  const { data: { user }, error } = await supabase.auth.getUser(token);
  return { user: error ? null : user, supabase, configError: false };
}

// The user_followed_* tables reference user_accounts, and registration only
// creates the auth user. An existing account row is left untouched.
export async function ensureUserAccount(supabase: SupabaseClient, user: User): Promise<boolean> {
  if (!user.email) return false;

  const { error } = await supabase
    .from('user_accounts')
    .upsert({ user_id: user.id, email: user.email }, { onConflict: 'user_id', ignoreDuplicates: true });
  return !error;
}
