import { createTicket, getLinkSecret, isValidTicket } from './linkTicket';

// Profile picture links on our own domain (card #756). The profile routes give
// the browser `/api/profile/avatar/<user id>?ticket=<expiry>.<signature>`, and
// that route reads the picture from Storage on the server. The browser never
// sees the Supabase address, the bucket name or the storage path.
//
// myapp_profile.avatar_url holds the storage path (for example
// `<user id>.png`). Rows saved before #756 hold the bucket's public URL, which
// ends in the same path, so both are read here and no data migration is needed.

export const AVATAR_BUCKET = 'avatars';

// How long a link works, in seconds: one hour, like the stored-PDF link.
export const AVATAR_LINK_SECONDS = 3600;

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

// The picture types the upload accepts, with the extension each is stored under.
export const AVATAR_TYPES: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

// The type a stored picture is served as, by extension. Anything else (for
// example an .svg or .html saved before #756) is never served.
const EXTENSION_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

const PUBLIC_URL_PATH = /\/storage\/v1\/object\/public\/avatars\/([^?#]+)$/;
const USER_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

export function isAvatarUserId(value: string): boolean {
  return USER_ID_PATTERN.test(value);
}

// The storage path from avatar_url, or null when there is none or it is not
// this user's own `<user id>.<ext>` file.
export function avatarStoragePath(userId: string, avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  let path = avatarUrl;
  if (/^https?:\/\//i.test(avatarUrl)) {
    let pathname: string;
    try {
      pathname = new URL(avatarUrl).pathname;
    } catch {
      return null;
    }
    const match = PUBLIC_URL_PATH.exec(pathname);
    if (!match) return null;
    try {
      path = decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }
  const extension = path.startsWith(`${userId}.`) ? path.slice(userId.length + 1) : '';
  return /^[A-Za-z0-9]{1,10}$/.test(extension) ? path : null;
}

// The Content-Type a stored picture is served with, or null when its type is
// not one the upload accepts.
export function avatarContentType(path: string): string | null {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return EXTENSION_TYPES[extension] ?? null;
}

export function avatarTicket(userId: string, now: number = Date.now()): string | null {
  return createTicket('avatar', userId, AVATAR_LINK_SECONDS, now);
}

export function isValidAvatarTicket(userId: string, ticket: string | null, now: number = Date.now()): boolean {
  return isValidTicket('avatar', userId, ticket, now);
}

// The link the profile page shows, or null when the profile has no picture.
// Also null, with a log line, when PDF_LINK_SECRET is not set.
export function avatarLink(userId: string, avatarUrl: string | null | undefined, now: number = Date.now()): string | null {
  if (!avatarStoragePath(userId, avatarUrl)) return null;
  if (!getLinkSecret()) {
    console.error('PDF_LINK_SECRET is not set, so no profile picture link is shown.');
    return null;
  }
  return `/api/profile/avatar/${userId}?ticket=${avatarTicket(userId, now)}`;
}

// A profile row as the browser gets it: avatar_url is the own-domain link.
export function withAvatarLink<T extends { id: string; avatar_url?: string | null }>(profile: T): T {
  return { ...profile, avatar_url: avatarLink(profile.id, profile.avatar_url) };
}
