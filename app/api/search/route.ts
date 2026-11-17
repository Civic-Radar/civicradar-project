// SRS-506.2, YA, Search submission.
// "The system shall run a search across meetings, documents, agenda items, and
//  officials when the user submits a query containing at least one
//  non-whitespace character."
// SRS-507.1, YA, Search results display: each result is labeled Meeting,
// Document, Agenda item, or Official. SRS-507.2: each result links to its page.
//
// GET /api/search?q=<query> -> { results: SearchResult[] }, best matches first.
import { getSupabaseClient } from '../../../lib/supabase';
import { anyTermFilter, rankResults, searchTerms, termScore, type SearchResult } from '../../../lib/search';

export const dynamic = 'force-dynamic';

// Rows read per kind before ranking, and results returned in all.
const PER_KIND = 25;
const MAX_RESULTS = 60;

const SEARCH_FAILED = 'Search could not be completed. Please try again.';

type Town = { town_id: number; name: string; meeting_time_zone: string | null };
type MeetingRow = {
  meeting_id: number;
  town_id: number;
  title: string | null;
  source_body_name: string | null;
  location: string | null;
  start_at: string | null;
};
type DocumentRow = { document_id: number; title: string; document_type: string; summary_text: string | null };
type AgendaItemRow = { agenda_item_id: number; meeting_id: number; title: string; item_text: string | null };
type OfficialRow = { official_id: number; full_name: string; title: string | null; role: string | null };

function getToken(request: Request): string | null {
  const auth = request.headers.get('Authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}

function formatDate(startAt: string | null, timeZone: string | null): string | null {
  if (!startAt) return null;
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: timeZone || 'America/New_York',
    }).format(date);
  } catch {
    return null;
  }
}

function snippet(text: string | null, length = 140): string | null {
  if (!text) return null;
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

export async function GET(request: Request) {
  const token = getToken(request);
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // SRS-506.3: an empty or whitespace-only query never runs a search.
  const terms = searchTerms(new URL(request.url).searchParams.get('q'));
  if (terms === null) return Response.json({ error: 'Enter something to search for.' }, { status: 400 });

  const supabase = getSupabaseClient();
  if (!supabase) return Response.json({ error: 'Supabase credentials are not configured.' }, { status: 500 });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return Response.json({ error: 'Invalid or expired token.' }, { status: 401 });

  // Only punctuation was typed: the search ran and found nothing.
  if (terms.length === 0) return Response.json({ results: [] }, { status: 200 });

  // Each kind is read twice, at the same time: the rows that contain every word
  // (the best matches, so they're never crowded out by the row limit, bug #523),
  // and the rows that contain any word. The two are merged before ranking.
  type Kind = { table: string; columns: string; searchIn: string[]; id: string; activeOnly?: boolean };
  const KINDS: Kind[] = [
    { table: 'meetings', columns: 'meeting_id, town_id, title, source_body_name, location, start_at', searchIn: ['title', 'source_body_name', 'location'], id: 'meeting_id' },
    { table: 'documents', columns: 'document_id, title, document_type, summary_text', searchIn: ['title', 'summary_text'], id: 'document_id' },
    { table: 'agenda_items', columns: 'agenda_item_id, meeting_id, title, item_text', searchIn: ['title', 'item_text'], id: 'agenda_item_id', activeOnly: true },
    { table: 'officials', columns: 'official_id, full_name, title, role', searchIn: ['full_name', 'title', 'role'], id: 'official_id' },
  ];

  function read(kind: Kind, mode: 'all' | 'any') {
    let query = supabase!.from(kind.table).select(kind.columns);
    if (kind.activeOnly) query = query.is('removed_at', null);
    // Every word: one "or" across the columns per word; PostgREST ANDs them together.
    if (mode === 'all') for (const term of terms!) query = query.or(anyTermFilter(kind.searchIn, [term]));
    else query = query.or(anyTermFilter(kind.searchIn, terms!));
    return query.limit(PER_KIND);
  }

  async function readKind(kind: Kind): Promise<{ data: unknown[] | null; error: unknown }> {
    const [all, any] = await Promise.all([
      terms!.length > 1 ? read(kind, 'all') : Promise.resolve({ data: [], error: null }),
      read(kind, 'any'),
    ]);
    if (all.error || any.error) return { data: null, error: all.error ?? any.error };
    const rows = new Map<unknown, unknown>();
    for (const row of [...(all.data ?? []), ...(any.data ?? [])] as unknown as Record<string, unknown>[]) {
      if (!rows.has(row[kind.id])) rows.set(row[kind.id], row);
    }
    return { data: [...rows.values()], error: null };
  }

  const [meetings, documents, agendaItems, officials, towns] = await Promise.all([
    ...KINDS.map(readKind),
    supabase.from('towns').select('town_id, name, meeting_time_zone'),
  ]);

  if (meetings.error || documents.error || agendaItems.error || officials.error || towns.error) {
    console.error('Search failed:', meetings.error ?? documents.error ?? agendaItems.error ?? officials.error ?? towns.error);
    return Response.json({ error: SEARCH_FAILED }, { status: 500 });
  }

  const townById = new Map(((towns.data ?? []) as Town[]).map((town) => [town.town_id, town]));
  const results: SearchResult[] = [];

  for (const row of (meetings.data ?? []) as MeetingRow[]) {
    const town = townById.get(row.town_id);
    results.push({
      type: 'Meeting',
      key: `meeting-${row.meeting_id}`,
      title: row.title || 'Untitled meeting',
      detail: [town?.name, formatDate(row.start_at, town?.meeting_time_zone ?? null)].filter(Boolean).join(' · ') || null,
      href: `/meetings/${row.meeting_id}`,
      score: termScore([row.title, row.source_body_name, row.location], terms),
    });
  }

  for (const row of (documents.data ?? []) as DocumentRow[]) {
    results.push({
      type: 'Document',
      key: `document-${row.document_id}`,
      title: row.title,
      detail: snippet(row.summary_text) ?? row.document_type,
      href: `/documents/${row.document_id}`,
      score: termScore([row.title, row.summary_text], terms),
    });
  }

  // An agenda item has no page of its own, so it opens its meeting.
  for (const row of (agendaItems.data ?? []) as AgendaItemRow[]) {
    results.push({
      type: 'Agenda item',
      key: `agenda-item-${row.agenda_item_id}`,
      title: row.title,
      detail: snippet(row.item_text),
      href: `/meetings/${row.meeting_id}`,
      score: termScore([row.title, row.item_text], terms),
    });
  }

  // The official information page (SRS-505) is not built yet, so officials open the Officials page.
  for (const row of (officials.data ?? []) as OfficialRow[]) {
    results.push({
      type: 'Official',
      key: `official-${row.official_id}`,
      title: row.full_name,
      detail: [row.title, row.role].filter(Boolean).join(' · ') || null,
      href: '/officials',
      score: termScore([row.full_name, row.title, row.role], terms),
    });
  }

  return Response.json({ results: rankResults(results).slice(0, MAX_RESULTS) }, { status: 200 });
}
