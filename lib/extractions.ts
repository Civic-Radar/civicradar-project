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

// SRS-304.1 — one entry on the Saved Extractions page (GET /api/extractions?saved=1),
// with how many officials it found (Task 304.1-5).
export type SavedExtraction = Extraction & { officials_found: number };

// Task 304.1-5 — "1 official found" / "3 officials found" / "No officials found".
export function officialsFoundLabel(count: number): string {
  if (count === 0) return 'No officials found';
  return `${count} ${count === 1 ? 'official' : 'officials'} found`;
}

// Task 304.1-5 — saved extractions whose source document title contains the search
// text, ignoring letter case. An empty search shows them all.
export function filterSavedExtractions<T extends { source_document_title: string }>(list: T[], search: string): T[] {
  const text = search.trim().toLowerCase();
  return text ? list.filter((e) => e.source_document_title.toLowerCase().includes(text)) : list;
}

// SRS-305.2 — the deletion confirmation names the extraction's source document.
export function deletionConfirmationMessage(sourceDocumentTitle: string): string {
  return `Delete your extraction of "${sourceDocumentTitle}"?`;
}

// SRS-304.1 — when an extraction was performed: when it finished, or when it was
// requested if it hasn't finished.
export function extractionDate(extraction: { requested_at: string; completed_at: string | null }): string {
  return extraction.completed_at ?? extraction.requested_at;
}

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

// SRS-302.4 — exact wording when a completed extraction found nobody.
export const NO_OFFICIALS_MESSAGE = 'No officials could be extracted from this document.';

// The causes an extraction can fail with (extractions.failure_cause CHECK constraint).
export type FailureCause = 'Unreadable file' | 'File too large' | 'Missing source file' | 'Other';

// One extraction as returned by GET /api/extractions/[id].
export type ExtractionDetail = Extraction & {
  failure_cause: FailureCause | null;
  // SRS-307.2: the cause in plain words when it is a known one; null otherwise.
  failure_message: string | null;
};

// SRS-307.2 — the known causes, in plain words. No error codes or technical details.
// 'Other' is not a known cause (SRS-307.3), so it has no message here.
export const FAILURE_CAUSE_MESSAGES: Record<Exclude<FailureCause, 'Other'>, string> = {
  'Unreadable file': 'The file could not be read.',
  'File too large': 'The file is larger than the 25 MB size limit.',
  'Missing source file': 'The source file could not be found.',
};

export function failureCauseMessage(cause: string | null): string | null {
  return cause && cause in FAILURE_CAUSE_MESSAGES ? FAILURE_CAUSE_MESSAGES[cause as keyof typeof FAILURE_CAUSE_MESSAGES] : null;
}

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
