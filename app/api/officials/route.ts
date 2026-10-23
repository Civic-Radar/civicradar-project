// SRS-311.1, AO, View shared officials list.
// "The system shall display a single shared list of officials extracted from
//  documents for the pilot municipality."
//
// GET /api/officials -> the shared list (filled by SRS-311.2): each official once,
// with the most recent title, role, email, and phone, the governing body, and
// every document the official was found in. Signed-in users only.
import { getSupabaseClient } from '../../../lib/supabase';
import { toSharedOfficial, type SharedOfficialRow } from '../../../lib/extractions';

export const dynamic = 'force-dynamic';

const COLUMNS =
  'official_id, full_name, title, role, email, phone, body:governing_bodies(name), sources:official_sources(document:documents(document_id, title))';

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

  const { data, error } = await supabase.from('officials').select(COLUMNS).order('full_name', { ascending: true });
  if (error) return Response.json({ error: 'Could not load the officials.' }, { status: 500 });

  const officials = ((data ?? []) as unknown as SharedOfficialRow[]).map(toSharedOfficial);
  return Response.json({ officials }, { status: 200 });
}
