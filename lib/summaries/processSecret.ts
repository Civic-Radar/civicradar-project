import { createHash, timingSafeEqual } from 'node:crypto';

export const SUMMARY_PROCESS_SECRET_HEADER = 'x-summary-process-secret';

// The process secret, or null when SUMMARY_PROCESS_SECRET is not set or blank.
export function getProcessSecret(): string | null {
  return process.env.SUMMARY_PROCESS_SECRET?.trim() || null;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

// Compares the header with the secret in constant time. Both sides are hashed
// first so the lengths always match and the secret's length is not revealed.
// A missing header or an unset secret never matches.
export function isValidProcessSecret(header: string | null): boolean {
  const secret = getProcessSecret();
  if (!secret || header === null) {
    return false;
  }
  return timingSafeEqual(digest(header), digest(secret));
}
