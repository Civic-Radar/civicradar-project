// Shared constants for the Officials & Contact Extractions area (AO).

// SRS-301.6 — exact wording required by the SRS.
export const UNSUPPORTED_FORMAT_MESSAGE = "This file can't be extracted. Only PDF documents are supported.";

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
};
