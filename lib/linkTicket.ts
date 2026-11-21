import { createHmac, timingSafeEqual } from 'node:crypto';

// Tickets for links on our own domain that stand in for Supabase Storage
// links (cards #726 and #756). A ticket is `<expiry>.<signature>`, where the
// signature is an HMAC-SHA256 of the link's scope, its id and the expiry,
// keyed with PDF_LINK_SECRET. A ticket opens only its own scope and id until it
// expires, so a stored-PDF ticket never opens an avatar, and the reverse.

export type TicketScope = 'stored-pdf' | 'avatar';

const TICKET_PATTERN = /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/;

// The ticket secret, or null when PDF_LINK_SECRET is not set or blank.
export function getLinkSecret(): string | null {
  return process.env.PDF_LINK_SECRET?.trim() || null;
}

function signature(secret: string, scope: TicketScope, id: string | number, expiresAt: number): Buffer {
  return createHmac('sha256', secret).update(`${scope}:${id}:${expiresAt}`).digest();
}

// A ticket valid for `seconds` from `now`, or null when the secret is not set.
export function createTicket(
  scope: TicketScope,
  id: string | number,
  seconds: number,
  now: number = Date.now(),
): string | null {
  const secret = getLinkSecret();
  if (!secret) return null;
  const expiresAt = Math.floor(now / 1000) + seconds;
  return `${expiresAt}.${signature(secret, scope, id, expiresAt).toString('base64url')}`;
}

// True only for a well-formed, unexpired ticket signed for this scope and id.
// An unset secret never matches. The signatures are compared in constant time.
export function isValidTicket(
  scope: TicketScope,
  id: string | number,
  ticket: string | null,
  now: number = Date.now(),
): boolean {
  const secret = getLinkSecret();
  if (!secret || !ticket) return false;
  const match = TICKET_PATTERN.exec(ticket);
  if (!match) return false;
  const expiresAt = Number(match[1]);
  if (expiresAt <= Math.floor(now / 1000)) return false;
  const given = Buffer.from(match[2], 'base64url');
  const expected = signature(secret, scope, id, expiresAt);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
