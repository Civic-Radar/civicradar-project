import { createHash, timingSafeEqual } from 'node:crypto';

// Same approach as lib/summaries/processSecret.ts, with its own secret so
// tagging and summary processing can be turned off or rotated separately.
export const TOPIC_TAGGING_SECRET_HEADER = 'x-topic-tagging-secret';

// The tagging secret, or null when TOPIC_TAGGING_SECRET is not set or blank.
export function getTopicTaggingSecret(): string | null {
  return process.env.TOPIC_TAGGING_SECRET?.trim() || null;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

// Compares the header with the secret in constant time. Both sides are hashed
// first so the lengths always match and the secret's length is not revealed.
// A missing header or an unset secret never matches.
export function isValidTopicTaggingSecret(header: string | null): boolean {
  const secret = getTopicTaggingSecret();
  if (!secret || header === null) {
    return false;
  }
  return timingSafeEqual(digest(header), digest(secret));
}
