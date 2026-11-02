import { createHash, timingSafeEqual } from 'node:crypto';

export const RETRIEVAL_SCHEDULE_SECRET_HEADER = 'x-retrieval-schedule-secret';

// The schedule secret, or null when RETRIEVAL_SCHEDULE_SECRET is not set or blank.
export function getScheduleSecret(): string | null {
  return process.env.RETRIEVAL_SCHEDULE_SECRET?.trim() || null;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

// Compares the header with the secret in constant time. Both sides are hashed
// first so the lengths always match and the secret's length is not revealed.
// A missing header or an unset secret never matches.
export function isValidScheduleSecret(header: string | null): boolean {
  const secret = getScheduleSecret();
  if (!secret || header === null) {
    return false;
  }
  return timingSafeEqual(digest(header), digest(secret));
}
