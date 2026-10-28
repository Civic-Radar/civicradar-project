// SRS-311.1, AO, View officials list.
// "The system shall display the officials found by the signed-in user's saved
//  extractions who have an email address or telephone number, each listed once
//  with the documents they were found in."
//
// GET /api/officials -> the signed-in user's officials list, built from their own
// completed extractions (see lib/officialsList.ts). Other users' extractions are
// never read.
import { getSupabaseClient } from '../../../lib/supabase';
import { buildOfficialsList, type ExtractionWithOfficials } from '../../../lib/officialsList';

export const dynamic = 'force-dynamic';

const COLUMNS =
  'extraction_id, completed_at, document_id, source_document_title, document:documents(town_id), officials:extracted_officials(full_name, title, role, email, phone)';

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

  const { data, error } = await supabase
    .from('extractions')
    .select(COLUMNS)
    .eq('user_id', user.id)
    .eq('status', 'Completed')
    .order('completed_at', { ascending: true });
  if (error) return Response.json({ error: 'Could not load the officials.' }, { status: 500 });

  const officials = buildOfficialsList((data ?? []) as unknown as ExtractionWithOfficials[]);

  // Task 311.1-8: each official's town name, so the page can split the list by city.
  // documents has no foreign key to towns, so the names are read separately.
  const townIds = [...new Set(officials.map((o) => o.town_id).filter((id): id is number => id !== null))];
  if (townIds.length > 0) {
    const { data: towns, error: townsError } = await supabase.from('towns').select('town_id, name').in('town_id', townIds);
    if (townsError) return Response.json({ error: 'Could not load the officials.' }, { status: 500 });
    const names = new Map(((towns ?? []) as { town_id: number; name: string }[]).map((t) => [t.town_id, t.name]));
    for (const official of officials) if (official.town_id !== null) official.town_name = names.get(official.town_id);
  }

  return Response.json({ officials }, { status: 200 });
}
