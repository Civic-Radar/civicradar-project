import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Card #756: the profile picture is served from our own domain. The browser
// never gets a Supabase address, the bucket name or the storage path, and the
// upload stores only PNG, JPEG, WebP or GIF pictures up to 2 MB.

const USER = 'user-123';
const PUBLIC_URL = `https://example.supabase.co/storage/v1/object/public/avatars/${USER}.png`;
const PICTURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const OWN_LINK = /^\/api\/profile\/avatar\/user-123\?ticket=\d+\.[A-Za-z0-9_-]{43}$/;
const TELLING = 'Object not found in bucket avatars at user-123.png (policy "owner only")';
const STORAGE_PARTS = ['supabase', 'storage/v1', 'avatars/', 'user-123.png', 'Object not found', 'policy'];

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  profile: null as Row | null,
  profileError: null as { message: string } | null,
  updates: [] as Row[],
  downloads: [] as { bucket: string; path: string }[],
  uploads: [] as { bucket: string; path: string; options: unknown }[],
  download: null as (() => Promise<{ data: Blob | null; error: { message: string } | null }>) | null,
}));

vi.mock('../../lib/supabase', () => {
  function chain() {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'insert']) builder[method] = () => builder;
    builder.update = (values: Row) => {
      db.updates.push(values);
      if (db.profile) db.profile = { ...db.profile, ...values };
      return builder;
    };
    const one = async () => (db.profileError ? { data: null, error: db.profileError } : { data: db.profile, error: null });
    builder.single = one;
    builder.maybeSingle = one;
    return builder;
  }

  return {
    getSupabaseClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-123' } }, error: null })),
      },
      from: vi.fn(() => chain()),
      storage: {
        from: vi.fn((bucket: string) => ({
          upload: vi.fn(async (path: string, _file: Blob, options: unknown) => {
            db.uploads.push({ bucket, path, options });
            return { error: null };
          }),
          download: vi.fn(async (path: string) => {
            db.downloads.push({ bucket, path });
            return db.download ? db.download() : { data: null, error: { message: 'not set up' } };
          }),
        })),
      },
    })),
  };
});

import {
  avatarContentType,
  avatarLink,
  avatarStoragePath,
  avatarTicket,
  isValidAvatarTicket,
} from '../../lib/avatarLink';
import { createPdfTicket } from '../../lib/pdfLinkTicket';
import { GET as servePicture } from '../../app/api/profile/avatar/[userId]/route';
import { POST as uploadPicture } from '../../app/api/profile/avatar/route';
import { GET as getProfile } from '../../app/api/profile/route';

const NOW = Date.UTC(2026, 10, 21, 12, 0, 0);

function pictureRequest(userId = USER, ticket: string | null = avatarTicket(USER)) {
  const query = ticket === null ? '' : `?ticket=${ticket}`;
  return servePicture(new Request(`http://localhost/api/profile/avatar/${userId}${query}`), { params: { userId } });
}

function uploadRequest(type: string, size = 16, name = 'me.png') {
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(size)], { type }), name);
  return uploadPicture(
    new Request('http://localhost/api/profile/avatar', { method: 'POST', headers: { authorization: 'Bearer valid-token' }, body: form }),
  );
}

async function expectNothingStorageRelated(response: Response) {
  const text = await response.clone().text();
  for (const part of STORAGE_PARTS) expect(text).not.toContain(part);
  for (const [, value] of response.headers) {
    for (const part of STORAGE_PARTS) expect(value).not.toContain(part);
  }
}

beforeEach(() => {
  vi.stubEnv('PDF_LINK_SECRET', 'test-link-secret');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  db.profile = { id: USER, username: 'resident', biography: '', avatar_url: `${USER}.png` };
  db.profileError = null;
  db.updates = [];
  db.downloads = [];
  db.uploads = [];
  db.download = async () => ({ data: new Blob([PICTURE], { type: 'image/png' }), error: null });
});

afterEach(() => {
  vi.mocked(console.error).mockRestore();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('avatarStoragePath', () => {
  it('reads a stored path', () => {
    expect(avatarStoragePath(USER, `${USER}.png`)).toBe(`${USER}.png`);
  });

  it('reads the path at the end of an old public URL, so rows saved before #756 still show', () => {
    expect(avatarStoragePath(USER, PUBLIC_URL)).toBe(`${USER}.png`);
    expect(avatarStoragePath(USER, `${PUBLIC_URL}?t=1`)).toBe(`${USER}.png`);
  });

  it.each([
    ['no picture', null],
    ['an empty value', ''],
    ["another user's file", 'user-999.png'],
    ['a path in a folder', `folder/${USER}.png`],
    ['a path that climbs out', `${USER}.png/../secret.png`],
    ['a URL that is not the avatars bucket', 'https://example.supabase.co/storage/v1/object/public/documents/1/1168.pdf'],
    ['a URL on another site', `https://evil.example.com/${USER}.png`],
    ['a value that is not a URL', 'https://'],
  ])('is null for %s', (_label, value) => {
    expect(avatarStoragePath(USER, value)).toBeNull();
  });
});

describe('avatarContentType', () => {
  it.each([
    ['a.png', 'image/png'],
    ['a.jpg', 'image/jpeg'],
    ['a.JPEG', 'image/jpeg'],
    ['a.webp', 'image/webp'],
    ['a.gif', 'image/gif'],
  ])('serves %s as %s', (path, type) => {
    expect(avatarContentType(path)).toBe(type);
  });

  it.each([['a.svg'], ['a.html'], ['a.heic'], ['a']])('never serves %s', (path) => {
    expect(avatarContentType(path)).toBeNull();
  });
});

describe('avatar tickets', () => {
  it('opens only its own user until it expires', () => {
    const ticket = avatarTicket(USER, NOW);
    expect(isValidAvatarTicket(USER, ticket, NOW)).toBe(true);
    expect(isValidAvatarTicket(USER, ticket, NOW + 3599_000)).toBe(true);
    expect(isValidAvatarTicket(USER, ticket, NOW + 3600_000)).toBe(false);
    expect(isValidAvatarTicket('user-999', ticket, NOW)).toBe(false);
  });

  it('never accepts a stored-PDF ticket, even for the same id', () => {
    vi.stubEnv('PDF_LINK_SECRET', 'test-link-secret');
    const pdfTicket = createPdfTicket(123, NOW);
    expect(isValidAvatarTicket('123', pdfTicket, NOW)).toBe(false);
  });

  it('is never valid without the secret', () => {
    const ticket = avatarTicket(USER, NOW);
    vi.stubEnv('PDF_LINK_SECRET', '');
    expect(avatarTicket(USER, NOW)).toBeNull();
    expect(isValidAvatarTicket(USER, ticket, NOW)).toBe(false);
  });

  it('gives no link, and logs once, when the secret is not set', () => {
    vi.stubEnv('PDF_LINK_SECRET', '');
    expect(avatarLink(USER, `${USER}.png`)).toBeNull();
    expect(console.error).toHaveBeenCalledWith('PDF_LINK_SECRET is not set, so no profile picture link is shown.');
  });

  it('gives no link, and logs nothing, when there is no picture', () => {
    expect(avatarLink(USER, null)).toBeNull();
    expect(console.error).not.toHaveBeenCalled();
  });
});

describe('GET /api/profile/avatar/[userId]', () => {
  it('serves the picture with a fixed image type and no Storage details', async () => {
    const response = await pictureRequest();

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.clone().arrayBuffer())).toEqual(PICTURE);
    expect(db.downloads).toEqual([{ bucket: 'avatars', path: `${USER}.png` }]);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-length')).toBe(String(PICTURE.byteLength));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('referrer-policy')).toBe('no-referrer');
    expect(response.headers.get('content-security-policy')).toBe("default-src 'none'");
    await expectNothingStorageRelated(response);
  });

  it('serves a picture saved before #756 under its old public URL', async () => {
    db.profile = { ...db.profile!, avatar_url: PUBLIC_URL };

    const response = await pictureRequest();

    expect(response.status).toBe(200);
    expect(db.downloads).toEqual([{ bucket: 'avatars', path: `${USER}.png` }]);
  });

  it.each([
    ['no ticket', USER, null],
    ['a malformed ticket', USER, 'abc'],
    ["another user's ticket", USER, 'other'],
    ['a user id that climbs out', '..%2Fsecret', 'own'],
  ])('refuses %s with 403 before reading anything', async (_label, userId, kind) => {
    const ticket = kind === 'other' ? avatarTicket('user-999') : kind === 'own' ? avatarTicket(userId) : kind;

    const response = await pictureRequest(userId, ticket);

    expect(response.status).toBe(403);
    expect(await response.clone().json()).toEqual({ error: 'This picture link is not valid or has expired. Reload the page.' });
    expect(db.downloads).toEqual([]);
  });

  it('refuses an expired ticket with 403', async () => {
    const ticket = avatarTicket(USER, NOW);
    vi.useFakeTimers();
    vi.setSystemTime(NOW + 3600_000);

    const response = await pictureRequest(USER, ticket);

    expect(response.status).toBe(403);
    expect(db.downloads).toEqual([]);
  });

  it('needs the service role key, because the bucket is private', async () => {
    const ticket = avatarTicket(USER);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    const response = await pictureRequest(USER, ticket);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'The picture is not available.' });
    expect(db.downloads).toEqual([]);
  });

  it('answers a profile read failure with a fixed message and logs the reason', async () => {
    db.profileError = { message: TELLING };

    const response = await pictureRequest();

    expect(response.status).toBe(500);
    await expectNothingStorageRelated(response);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(TELLING));
  });

  it.each([
    ['no profile row', null],
    ['no picture', { id: USER, avatar_url: null }],
    ["another user's file", { id: USER, avatar_url: 'user-999.png' }],
    ['an .svg saved before #756', { id: USER, avatar_url: `${USER}.svg` }],
    ['an .html saved before #756', { id: USER, avatar_url: `${USER}.html` }],
  ])('answers 404 for %s without downloading', async (_label, profile) => {
    db.profile = profile;

    const response = await pictureRequest();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'The picture is not available.' });
    expect(db.downloads).toEqual([]);
  });

  it.each([
    ['returns an error', async () => ({ data: null, error: { message: TELLING } })],
    ['throws', async () => { throw new Error(TELLING); }],
  ])('answers 404 when the download %s, and logs the reason', async (_label, download) => {
    db.download = download;

    const response = await pictureRequest();

    expect(response.status).toBe(404);
    await expectNothingStorageRelated(response);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(TELLING));
  });
});

describe('POST /api/profile/avatar upload checks', () => {
  it.each([
    ['image/png', 'png'],
    ['image/jpeg', 'jpg'],
    ['image/webp', 'webp'],
    ['image/gif', 'gif'],
  ])('stores %s as .%s and saves the path, not a URL', async (type, ext) => {
    const response = await uploadRequest(type);

    expect(response.status).toBe(200);
    expect(db.uploads).toEqual([{ bucket: 'avatars', path: `${USER}.${ext}`, options: { upsert: true, contentType: type } }]);
    expect(db.updates).toEqual([{ avatar_url: `${USER}.${ext}` }]);
    const body = await response.json();
    expect(body.profile.avatar_url).toMatch(OWN_LINK);
  });

  it('takes the extension from the type, never from the file name', async () => {
    await uploadRequest('image/png', 16, 'evil.html');

    expect(db.uploads.map((upload) => upload.path)).toEqual([`${USER}.png`]);
  });

  it.each([['image/svg+xml'], ['text/html'], ['image/heic'], ['application/octet-stream'], ['']])(
    'refuses %s with 400 and stores nothing',
    async (type) => {
      const response = await uploadRequest(type);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'Use a PNG, JPEG, WebP or GIF image.' });
      expect(db.uploads).toEqual([]);
      expect(db.updates).toEqual([]);
    },
  );

  it('accepts exactly 2 MB and refuses anything larger', async () => {
    expect((await uploadRequest('image/png', 2 * 1024 * 1024)).status).toBe(200);
    db.uploads = [];

    const response = await uploadRequest('image/png', 2 * 1024 * 1024 + 1);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'The picture must be 2 MB or smaller.' });
    expect(db.uploads).toEqual([]);
  });
});

describe('GET /api/profile picture link', () => {
  it.each([
    ['a stored path', `${USER}.png`],
    ['an old public URL', PUBLIC_URL],
  ])('returns the own-domain link for %s', async (_label, avatarUrl) => {
    db.profile = { id: USER, username: 'resident', biography: '', avatar_url: avatarUrl };

    const response = await getProfile(new Request('http://localhost/api/profile', { headers: { authorization: 'Bearer valid-token' } }));

    expect(response.status).toBe(200);
    expect((await response.clone().json()).profile.avatar_url).toMatch(OWN_LINK);
    await expectNothingStorageRelated(response);
  });

  it('returns null when there is no profile yet', async () => {
    db.profile = null;

    const response = await getProfile(new Request('http://localhost/api/profile', { headers: { authorization: 'Bearer valid-token' } }));

    expect(await response.json()).toEqual({ profile: null });
  });
});
