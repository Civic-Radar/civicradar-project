import { getSupabaseClient } from '../../../lib/supabase';
import {
  TOWN_COLUMNS,
  cleanTownInput,
  findMissingTownFields,
  missingFieldsMessage,
  townSaveErrorMessage,
} from '../../../lib/towns';

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

// List the towns in the catalog so the settings page can show and edit them.
export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const { data, error } = await supabase!
    .from('towns')
    .select(TOWN_COLUMNS)
    .is('removed_at', null)
    .order('name');

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ towns: data ?? [] }, { status: 200 });
}

// SRS-104.6: save a new town. Source account identifier and meeting time zone are required.
export async function POST(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const values = cleanTownInput(await request.json().catch(() => null));
  const missingFields = findMissingTownFields(values);
  if (missingFields.length > 0) {
    return Response.json({ error: missingFieldsMessage(missingFields), missingFields }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from('towns')
    .insert(values)
    .select(TOWN_COLUMNS)
    .single();

  if (error) return Response.json({ error: townSaveErrorMessage(error, values) }, { status: 400 });

  return Response.json({ town: data }, { status: 201 });
}
