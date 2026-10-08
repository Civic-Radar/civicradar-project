// Shared constants for the Officials & Contact Extractions area (AO).

// SRS-301.6 — exact wording required by the SRS.
export const UNSUPPORTED_FORMAT_MESSAGE = "This file can't be extracted. Only PDF documents are supported.";

// SRS-306.3 — shown when the same document is already Queued or Processing.
export const ALREADY_IN_PROGRESS_MESSAGE = 'An extraction for this document is already in progress.';

export type ExtractionStatus = 'Queued' | 'Processing' | 'Completed' | 'Failed';

export type Extraction = {
  extraction_id: number;
  user_id: string;
  document_id: number | null;
  source_document_title: string;
  status: ExtractionStatus;
  requested_at: string;
  completed_at: string | null;
};

export type ExtractableDocument = {
  document_id: number;
  title: string;
  document_type: 'Agenda' | 'Minutes' | 'Packet' | 'Other';
  mime_type: string;
  retrieved_at: string;
};
