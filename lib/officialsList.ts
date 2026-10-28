// SRS-311.1, AO, View officials list.
// "The system shall display the officials found by the signed-in user's saved
//  extractions who have an email address or telephone number, each listed once
//  with the documents they were found in."
//
// Built from the user's own completed extractions (extracted_officials):
//   - the same name (ignoring letter case and extra spaces) in the same town is
//     one entry, as in SRS-311.2;
//   - the most recent extraction's details win, and a detail it didn't find keeps
//     the earlier value;
//   - only people with an email address or telephone number are listed;
//   - each entry lists every document it was found in.
import { mergeDetails, nameKey } from './extraction/sharedOfficials';

export type OfficialSource = { extraction_id: number; document_id: number | null; title: string };

export type MyOfficial = {
  key: string;
  full_name: string;
  title: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  sources: OfficialSource[];
};

// One completed extraction as GET /api/officials reads it.
export type ExtractionWithOfficials = {
  extraction_id: number;
  completed_at: string | null;
  document_id: number | null;
  source_document_title: string;
  document: { town_id: number } | null;
  officials: { full_name: string; title: string | null; role: string | null; email: string | null; phone: string | null }[] | null;
};

export function buildOfficialsList(extractions: ExtractionWithOfficials[]): MyOfficial[] {
  const byPerson = new Map<string, MyOfficial>();
  const oldestFirst = [...extractions].sort((a, b) => (a.completed_at ?? '').localeCompare(b.completed_at ?? ''));

  for (const extraction of oldestFirst) {
    const source: OfficialSource = {
      extraction_id: extraction.extraction_id,
      document_id: extraction.document_id,
      title: extraction.source_document_title,
    };

    for (const found of extraction.officials ?? []) {
      const key = `${extraction.document?.town_id ?? 'none'}|${nameKey(found.full_name)}`;
      const existing = byPerson.get(key);
      if (!existing) {
        byPerson.set(key, {
          key, full_name: found.full_name, title: found.title, role: found.role, email: found.email, phone: found.phone, sources: [source],
        });
        continue;
      }
      Object.assign(existing, mergeDetails({ official_id: 0, ...existing }, found));
      const sameDocument = (s: OfficialSource) =>
        source.document_id !== null ? s.document_id === source.document_id : s.title === source.title;
      if (!existing.sources.some(sameDocument)) existing.sources.push(source);
    }
  }

  return [...byPerson.values()]
    .filter((official) => official.email || official.phone)
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}
