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
}
