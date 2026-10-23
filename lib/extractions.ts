// Shared constants for the Officials & Contact Extractions area (AO).

// SRS-301.6 — exact wording required by the SRS.
export const UNSUPPORTED_FORMAT_MESSAGE = "This file can't be extracted. Only PDF documents are supported.";

// SRS-303.2 — where the source link on an extraction result goes: the source
// document's detail page (SRS-203.1). null when the extraction has no source
// document any more (documents.document_id was removed), so nothing is linked.
export function sourceDocumentHref(extraction: { document_id: number | null }): string | null {
  return extraction.document_id === null ? null : `/documents/${extraction.document_id}`;
}

// SRS-310.2 — returned (with HTTP 403) when the signed-in user doesn't own the extraction.
export const ACCESS_DENIED_MESSAGE = "You don't have access to this extraction.";

// SRS-306.3 — shown when the same document is already Queued or Processing.
export const ALREADY_IN_PROGRESS_MESSAGE = 'An extraction for this document is already in progress.';

// SRS-306.1 — the four statuses an extraction can have, in the order they happen.
// Matches the CHECK constraint on extractions.status in supabase/schema.sql.
export const EXTRACTION_STATUSES = ['Queued', 'Processing', 'Completed', 'Failed'] as const;

export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

// SRS-306.2 — statuses that mean the extraction is still running.
export function isInProgress(status: ExtractionStatus): boolean {
  return status === 'Queued' || status === 'Processing';
}

export type Extraction = {
  extraction_id: number;
  user_id: string;
  document_id: number | null;
  source_document_title: string;
  status: ExtractionStatus;
  requested_at: string;
  completed_at: string | null;
};

// Badge colors for each status, shared by the request list and the extraction page.
export const STATUS_STYLES: Record<ExtractionStatus, string> = {
  Queued: 'border-warning-vivid/40 bg-warning-vivid/10 text-warning-soft',
  Processing: 'border-info-vivid/40 bg-info-vivid/10 text-info-soft',
  Completed: 'border-accent-vivid/40 bg-accent-vivid/10 text-accent-soft',
  Failed: 'border-danger-vivid/40 bg-danger-vivid/10 text-danger-soft',
};

// MM/DD/YYYY h:mm AM, the date format used throughout the SRS.
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} ${time}`;
}

// SRS-302.1 — one official found by an extraction. null means the document
// didn't give that detail; the page shows NOT_FOUND_LABEL in its place.
export type ExtractedOfficial = {
  extracted_official_id: number;
  full_name: string;
  title: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
};

// SRS-302.1 — the five fields, in display order, each shown next to its name.
export const OFFICIAL_FIELDS = [
  { key: 'full_name', label: 'Name' },
  { key: 'title', label: 'Title' },
  { key: 'role', label: 'Role' },
  { key: 'email', label: 'Email address' },
  { key: 'phone', label: 'Telephone number' },
] as const;

export const NOT_FOUND_LABEL = 'Not found';

// SRS-311.1 — one entry in the shared officials list (GET /api/officials).
// title, role, email, phone: the most recent found (SRS-311.2); null = unavailable.
export type SharedOfficial = {
  official_id: number;
  full_name: string;
  title: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  body_name: string | null;
  sources: { document_id: number; title: string }[];
};

// One officials row as Supabase returns it, with its body and source documents embedded.
export type SharedOfficialRow = Omit<SharedOfficial, 'body_name' | 'sources'> & {
  body: { name: string } | null;
  sources: { document: { document_id: number; title: string } | null }[] | null;
};

// Flattens one row: the body's name, and the source documents oldest first.
export function toSharedOfficial(row: SharedOfficialRow): SharedOfficial {
  return {
    official_id: row.official_id,
    full_name: row.full_name,
    title: row.title,
    role: row.role,
    email: row.email,
    phone: row.phone,
    body_name: row.body?.name ?? null,
    sources: (row.sources ?? [])
      .map((s) => s.document)
      .filter((d): d is { document_id: number; title: string } => d !== null)
      .sort((a, b) => a.document_id - b.document_id),
  };
}

// SRS-302.4 — exact wording when a completed extraction found nobody.
export const NO_OFFICIALS_MESSAGE = 'No officials could be extracted from this document.';

// One extraction as returned by GET /api/extractions/[id].
export type ExtractionDetail = Extraction & {
  failure_cause: 'Unreadable file' | 'File too large' | 'Missing source file' | 'Other' | null;
};

// GET /api/extractions/[id] response: officials is filled once the extraction is Completed.
export type ExtractionDetailResponse = {
  extraction: ExtractionDetail;
  officials: ExtractedOfficial[];
};

export type ExtractableDocument = {
  document_id: number;
  title: string;
  document_type: 'Agenda' | 'Minutes' | 'Packet' | 'Other';
  mime_type: string;
  retrieved_at: string;
  // The meeting the document belongs to, for grouping on the extraction page.
  meeting: { meeting_id: number; title: string; start_at: string } | null;
};

const DOCUMENT_TYPE_ORDER: Record<string, number> = { Agenda: 0, Packet: 1, Minutes: 2, Other: 3 };

// Extraction page document list: newest meeting first, then within a meeting
// the agenda, packet, minutes, and anything else.
export function sortDocuments(documents: ExtractableDocument[]): ExtractableDocument[] {
  return [...documents].sort(
    (a, b) =>
      (b.meeting?.start_at ?? '').localeCompare(a.meeting?.start_at ?? '') ||
      (a.meeting?.meeting_id ?? 0) - (b.meeting?.meeting_id ?? 0) ||
      (DOCUMENT_TYPE_ORDER[a.document_type] ?? 9) - (DOCUMENT_TYPE_ORDER[b.document_type] ?? 9) ||
      a.title.localeCompare(b.title),
  );
}

// Formats a meeting's start time as "Mon, Oct 19, 2026" in the user's time zone.
export function formatMeetingDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// SRS-302.1 — officials with the most details found are listed first, so the
// most useful contacts are at the top. Ties keep the order they were found in.
export function sortByDetailsFound(officials: ExtractedOfficial[]): ExtractedOfficial[] {
  const found = (o: ExtractedOfficial) => [o.title, o.role, o.email, o.phone].filter(Boolean).length;
  const contact = (o: ExtractedOfficial) => (o.email || o.phone ? 1 : 0);
  return [...officials].sort((a, b) => contact(b) - contact(a) || found(b) - found(a));
}
