// SRS-311.2, AO, Merge repeated officials.
// "When an extraction finds an official already in the shared list, the system
//  shall update that entry instead of creating a second one."
//
// After an extraction saves what one document says (extracted_officials, private
// to the user), each official also goes into the shared list (officials):
//   - same name (ignoring letter case) in the same governing body -> update that
//     entry with the details this document found; a detail it didn't find is
//     left as it was, never blanked out
//   - otherwise -> add a new entry
// Either way the document is linked to the official (official_sources), so the
// entry keeps a link to every document it came from.
//
// The governing body is the one of the document's meeting. A meeting filed with
// no body (meetings.body_id is NULL) uses the town's governing body when the town
// has exactly one (Task 311.2-5); otherwise its officials stay only in the
// extraction. Contact details are never logged (SRS-310.3).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FoundOfficial } from './findOfficials';

export type ShareResult = { added: number; updated: number; skipped: number };

type SharedOfficial = {
  official_id: number;
  full_name: string;
  title: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
};

// Matches the unique index officials_name_body_uq (body_id, lower(full_name)).
export function nameKey(fullName: string): string {
  return fullName.replace(/\s+/g, ' ').trim().toLowerCase();
}

// The newest value wins; a detail this document didn't give keeps the old value.
export function mergeDetails(existing: SharedOfficial, found: FoundOfficial) {
  return {
    title: found.title ?? existing.title,
    role: found.role ?? existing.role,
    email: found.email ?? existing.email,
    phone: found.phone ?? existing.phone,
  };
}

const COLUMNS = 'official_id, full_name, title, role, email, phone';

// The governing body of the document's meeting.
//
// Task 311.2-5: retrieval files some meetings (for example Salem's special
// meetings, listed as "General") with no body. When the town has exactly one
// governing body, those meetings belong to it. With no body or several, it is
// left out (null) rather than guessed.
async function bodyOfDocument(supabase: SupabaseClient, documentId: number): Promise<number | null> {
  const { data: document } = await supabase
    .from('documents')
    .select('document_id, meeting_id')
    .eq('document_id', documentId)
    .maybeSingle();
  if (!document) return null;

  const { data: meeting } = await supabase
    .from('meetings')
    .select('meeting_id, town_id, body_id')
    .eq('meeting_id', document.meeting_id)
    .maybeSingle();
  if (!meeting) return null;
  if (meeting.body_id !== null) return meeting.body_id;

  const { data: bodies } = await supabase
    .from('governing_bodies')
    .select('body_id, removed_at')
    .eq('town_id', meeting.town_id);
  const current = (bodies ?? []).filter((b: { removed_at: string | null }) => b.removed_at === null);
  return current.length === 1 ? current[0].body_id : null;
}

async function findByName(supabase: SupabaseClient, bodyId: number, fullName: string): Promise<SharedOfficial | null> {
  const { data } = await supabase.from('officials').select(COLUMNS).eq('body_id', bodyId);
  const key = nameKey(fullName);
  return ((data ?? []) as SharedOfficial[]).find((o) => nameKey(o.full_name) === key) ?? null;
}

// Adds one official to the shared list, or updates the entry with the same name
// in the same body. Returns the shared official's id, and whether it was new.
async function upsertOfficial(
  supabase: SupabaseClient,
  bodyId: number,
  documentId: number,
  found: FoundOfficial,
): Promise<{ officialId: number; added: boolean } | null> {
  const existing = await findByName(supabase, bodyId, found.full_name);

  if (!existing) {
    const { data: inserted, error } = await supabase
      .from('officials')
      .insert({ body_id: bodyId, details_document_id: documentId, ...found })
      .select('official_id')
      .single();
    if (inserted) return { officialId: inserted.official_id, added: true };
    // 23505: another extraction added the same name a moment ago. Update that one.
    if (error?.code !== '23505') return null;
    const raced = await findByName(supabase, bodyId, found.full_name);
    if (!raced) return null;
    return updateOfficial(supabase, raced, documentId, found);
  }

  return updateOfficial(supabase, existing, documentId, found);
}

async function updateOfficial(
  supabase: SupabaseClient,
  existing: SharedOfficial,
  documentId: number,
  found: FoundOfficial,
): Promise<{ officialId: number; added: boolean } | null> {
  const { error } = await supabase
    .from('officials')
    .update({ ...mergeDetails(existing, found), details_document_id: documentId })
    .eq('official_id', existing.official_id);
  return error ? null : { officialId: existing.official_id, added: false };
}

export async function addToSharedOfficials(
  supabase: SupabaseClient,
  documentId: number,
  officials: FoundOfficial[],
): Promise<ShareResult> {
  const result: ShareResult = { added: 0, updated: 0, skipped: 0 };
  if (officials.length === 0) return result;

  const bodyId = await bodyOfDocument(supabase, documentId);
  if (bodyId === null) {
    result.skipped = officials.length;
    return result;
  }

  for (const found of officials) {
    const shared = await upsertOfficial(supabase, bodyId, documentId, found);
    if (!shared) {
      result.skipped += 1;
      continue;
    }
    if (shared.added) result.added += 1;
    else result.updated += 1;

    // Keep a link to every document the official came from (one row per pair).
    await supabase
      .from('official_sources')
      .upsert({ official_id: shared.officialId, document_id: documentId }, { onConflict: 'official_id,document_id', ignoreDuplicates: true });
  }

  return result;
}
