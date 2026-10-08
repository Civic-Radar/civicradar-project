import { getSupabaseClient } from '../../../../lib/supabase';
import {
  TOWN_COLUMNS,
  cleanTownInput,
  findMissingTownFields,
  missingFieldsMessage,
  townSaveErrorMessage,
} from '../../../../lib/towns';

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

// SRS-104.6: save an edited town. Source account identifier and meeting time zone are required.
export async function PATCH(request: Request, { params }: { params: { townId: string } }) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { user, supabase, configError } = await getAuthenticatedUser(token);
  if (configError) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });
  if (!user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  const townId = Number(params.townId);
  if (!Number.isInteger(townId) || townId <= 0) {
    return Response.json({ error: 'Invalid town id.' }, { status: 400 });
  }

  const values = cleanTownInput(await request.json().catch(() => null));
  const missingFields = findMissingTownFields(values);
  if (missingFields.length > 0) {
    return Response.json({ error: missingFieldsMessage(missingFields), missingFields }, { status: 400 });
  }

  const { data, error } = await supabase!
    .from('towns')
    .update(values)
    .eq('town_id', townId)
    .select(TOWN_COLUMNS)
    .maybeSingle();

  if (error) return Response.json({ error: townSaveErrorMessage(error, values) }, { status: 400 });
  if (!data) return Response.json({ error: 'Town not found.' }, { status: 404 });

  return Response.json({ town: data }, { status: 200 });
}
