import { createHmac, timingSafeEqual } from 'node:crypto';

// Tickets for the stored-PDF link on our own domain (card #726). The detail
// route gives a signed-in user `/api/documents/<id>/pdf?ticket=<expiry>.<signature>`,
// and the PDF route serves the file only for a valid, unexpired ticket. The
// browser never sees a Supabase address, bucket name or storage path.
//
// The signature is an HMAC-SHA256 of the document id and the expiry, keyed with
// PDF_LINK_SECRET, so a ticket opens only its own document until it expires.

// How long a link works, in seconds: one hour, so the View source PDF link still
// opens after the page has been open a while (SRS-207.2). Same as the old link.
export const PDF_LINK_SECONDS = 3600;

const TICKET_PATTERN = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/;

// The ticket secret, or null when PDF_LINK_SECRET is not set or blank.
export function getPdfLinkSecret(): string | null {
  return process.env.PDF_LINK_SECRET?.trim() || null;
}

function signature(secret: string, documentId: number, expiresAt: number): Buffer {
  return createHmac('sha256', secret).update(`stored-pdf:${documentId}:${expiresAt}`).digest();
}

// A ticket for one document, valid for PDF_LINK_SECONDS from `now`, or null
// when the secret is not set.
export function createPdfTicket(documentId: number, now: number = Date.now()): string | null {
  const secret = getPdfLinkSecret();
  if (!secret) return null;
  const expiresAt = Math.floor(now / 1000) + PDF_LINK_SECONDS;
  return `${expiresAt}.${signature(secret, documentId, expiresAt).toString('base64url')}`;
}

// The link the detail page shows for a stored PDF, or null when the secret is not set.
export function storedPdfLink(documentId: number, now: number = Date.now()): string | null {
  const ticket = createPdfTicket(documentId, now);
  return ticket ? `/api/documents/${documentId}/pdf?ticket=${ticket}` : null;
}

// True only for a well-formed, unexpired ticket signed for this document. An
// unset secret never matches. The signatures are compared in constant time.
export function isValidPdfTicket(documentId: number, ticket: string | null, now: number = Date.now()): boolean {
  const secret = getPdfLinkSecret();
  if (!secret || !ticket) return false;
  const match = TICKET_PATTERN.exec(ticket);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (expiresAt <= Math.floor(now / 1000)) return false;
  const given = Buffer.from(match[2], 'base64url');
  const expected = signature(secret, documentId, expiresAt);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
