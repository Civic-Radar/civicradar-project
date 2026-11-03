// Common meeting shape returned by every source client. Source-specific
// field names stay inside the client (e.g. lib/sources/civicclerk.ts).
// Any value the source omits is null, never an empty string (SRS-220.4).
export interface SourceMeeting {
  sourceMeetingId: string; // meeting identity within a town (SRS-220.2)
  title: string | null;
  sourceBodyId: string | null;
  sourceBodyName: string | null;
  sourceStartTime: string | null; // exactly as the source sent it (SRS-220.5)
  location: string | null;
  onlineLink: string | null;
  sourceUrl: string | null; // official source page
  // The reference fetchAgendaItems takes for this meeting's agenda, or null
  // when the source lists no agenda for it (SRS-220.9).
  agendaRef?: string | null;
}

// Common agenda item shape for one entry of a meeting's agenda (SRS-220.9).
// Source-specific field names stay inside the client.
export interface SourceAgendaItem {
  sourceItemId: string; // item identity within a meeting
  sortOrder: number; // position in the agenda, starting at 1
  title: string;
  itemText: string | null; // plain text, null when the source gives none
}

// The documents.document_type values. Each source client maps its own file
// types to one of these.
export type DocumentType = 'Agenda' | 'Minutes' | 'Packet' | 'Other';

// Common file shape for a file the source publishes under a meeting
// (SRS-208.2). Source-specific field names stay inside the client.
export interface SourceFile {
  sourceFileId: string; // file identity within a town
  fileName: string;
  sourceFileType: string | null; // exactly as the source sent it (e.g. "Agenda Packet")
  documentType: DocumentType; // sourceFileType mapped by the source client
  downloadUrl: string;
  sourcePageUrl: string; // public source page the user can open
  sizeBytes: number | null; // null when the source does not send a size
}

// Options a source client's file download takes (SRS-208.2). The limit always
// comes from the caller; without maxBytes the download has no size limit.
// onDeclaredSize is called once with the size the source declared, before the
// body is read, when the source declares one and it is within maxBytes.
export interface DownloadOptions {
  maxBytes?: number;
  onDeclaredSize?: (sizeBytes: number) => void;
}

// Thrown by a source client's file download when the file is larger than
// maxBytes. sizeBytes is the size the source declared, or null when it sent
// none and the read stopped once it passed the limit. The file is not stored.
export class FileTooLargeError extends Error {
  readonly sizeBytes: number | null;
  readonly maxBytes: number;

  constructor(sizeBytes: number | null, maxBytes: number) {
    super(
      sizeBytes === null
        ? `File is more than the limit of ${maxBytes} bytes`
        : `File is ${sizeBytes} bytes, over the limit of ${maxBytes} bytes`,
    );
    this.name = 'FileTooLargeError';
    this.sizeBytes = sizeBytes;
    this.maxBytes = maxBytes;
  }
}

// How far a source client's paged listing got (SRS-220.1). complete is true
// only when the source's last page was read within the page bound. A failed
// page, a timeout or pages left at the bound make it false. pagesRead counts
// only pages that converted fully.
export interface ListingProgress {
  complete: boolean;
  pagesRead: number;
}

// The retrieval window a listing is limited to (SRS-220.1): meetings that
// start from `from` to `to`, both ISO UTC strings like 2026-10-01T00:00:00Z.
// A source without a date filter would apply the window itself while paging
// and report complete only when every in-window page was read.
export interface ListingWindow {
  from: string;
  to: string;
}

export interface MeetingListing extends ListingProgress {
  meetings: SourceMeeting[];
}

export interface MeetingFilesListing extends ListingProgress {
  filesByMeeting: Map<string, SourceFile[]>; // keyed by source meeting id
}
