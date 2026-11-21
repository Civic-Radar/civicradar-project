import { createTicket, getLinkSecret, isValidTicket } from './linkTicket';

// Tickets for the stored-PDF link on our own domain (card #726). The detail
// route gives a signed-in user `/api/documents/<id>/pdf?ticket=<expiry>.<signature>`,
// and the PDF route serves the file only for a valid, unexpired ticket. The
// browser never sees a Supabase address, bucket name or storage path.
// The signing itself is in lib/linkTicket.ts, shared with the avatar link.

// How long a link works, in seconds: one hour, so the View source PDF link still
// opens after the page has been open a while (SRS-207.2). Same as the old link.
export const PDF_LINK_SECONDS = 3600;

// The ticket secret, or null when PDF_LINK_SECRET is not set or blank.
export const getPdfLinkSecret = getLinkSecret;

// A ticket for one document, valid for PDF_LINK_SECONDS from `now`, or null
// when the secret is not set.
export function createPdfTicket(documentId: number, now: number = Date.now()): string | null {
  return createTicket('stored-pdf', documentId, PDF_LINK_SECONDS, now);
}

// The link the detail page shows for a stored PDF, or null when the secret is not set.
export function storedPdfLink(documentId: number, now: number = Date.now()): string | null {
  const ticket = createPdfTicket(documentId, now);
  return ticket ? `/api/documents/${documentId}/pdf?ticket=${ticket}` : null;
}

// True only for a well-formed, unexpired ticket signed for this document.
export function isValidPdfTicket(documentId: number, ticket: string | null, now: number = Date.now()): boolean {
  return isValidTicket('stored-pdf', documentId, ticket, now);
}
