import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// #757: no route sends a Supabase or Postgres error message to the browser.
// Each failure below carries a message that names a table, a constraint and a
// policy. The response must hold only the route's fixed message, and the real
// message must reach the server log.

const TELLING = 'duplicate key value violates unique constraint "myapp_profile_pkey" on table public.secret_table (policy "admins only")';
const TELLING_PARTS = ['duplicate key', 'myapp_profile_pkey', 'secret_table', 'constraint', 'policy', 'public.'];

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string; code?: string } | null };

const db = vi.hoisted(() => ({
  failing: new Set<string>(),
  rows: {} as Record<string, Row[]>,
  authError: null as { message: string; code?: string } | null,
  uploadFails: false,
}));

vi.mock('../../lib/supabase', () => {
  function result(table: string, single: boolean): Result {
    if (db.failing.has(table)) return { data: null, error: { message: TELLING, code: '23505' } };
    const rows = db.rows[table] ?? [];
    return { data: single ? rows[0] ?? null : rows, error: null };
  }

  // Every query method returns the same chain; awaiting it gives a list,
  // single() and maybeSingle() give one row.
  function chain(table: string) {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'is', 'in', 'order', 'insert', 'update']) {
      builder[method] = () => builder;
    }
    builder.single = async () => result(table, true);
    builder.maybeSingle = async () => result(table, true);
    builder.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result(table, false)).then(resolve, reject);
    return builder;
  }

  return {
    getSupabaseClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-123', email: 'resident@example.com' } }, error: null })),
        signInWithPassword: vi.fn(async () =>
          db.authError ? { data: null, error: db.authError } : { data: { session: {} }, error: null },
        ),
        admin: {
          createUser: vi.fn(async () =>
            db.authError ? { data: null, error: db.authError } : { data: { user: { id: 'user-123' } }, error: null },
          ),
        },
      },
      from: vi.fn((table: string) => chain(table)),
      storage: {
        from: vi.fn(() => ({
          upload: vi.fn(async () => (db.uploadFails ? { error: { message: TELLING } } : { error: null })),
          getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://example.com/avatars/user-123.png' } })),
        })),
      },
    })),
  };
});

import { POST as login } from '../../app/api/auth/login/route';
import { POST as register } from '../../app/api/auth/register/route';
import { GET as getProfile, POST as createProfile, PATCH as saveProfile } from '../../app/api/profile/route';
import { POST as uploadAvatar } from '../../app/api/profile/avatar/route';
import { GET as listTowns } from '../../app/api/towns/route';
import { GET as listMeetings } from '../../app/api/meetings/route';
import { GET as getMeeting } from '../../app/api/meetings/[id]/route';
import { POST as runRetrieval } from '../../app/api/retrieval/meetings/route';

const AUTH = { authorization: 'Bearer valid-token' };

function json(url: string, method: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function avatarRequest() {
  const form = new FormData();
  form.append('image', new Blob(['fake-image'], { type: 'image/png' }), 'me.png');
  return new Request('http://localhost/api/profile/avatar', { method: 'POST', headers: AUTH, body: form });
}

const CREDENTIALS = { email: 'resident@example.com', password: 'secret123' };

// Reads everything the response sends and checks no part of the telling
// message is in it.
async function expectFixedMessage(response: Response, status: number, message: string) {
  const text = await response.text();
  expect(response.status).toBe(status);
  expect(JSON.parse(text)).toEqual({ error: message });
  for (const part of TELLING_PARTS) expect(text).not.toContain(part);
  for (const [, value] of response.headers) {
    for (const part of TELLING_PARTS) expect(value).not.toContain(part);
  }
}

function expectLogged(text: string) {
  expect(console.error).toHaveBeenCalledWith(expect.stringContaining(text));
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  db.failing.clear();
  db.authError = null;
  db.uploadFails = false;
  db.rows = {
    towns: [{
      town_id: 1,
      name: 'Salem',
      meeting_time_zone: 'America/New_York',
      provides_agenda_items: true,
      provides_recordings: false,
      source_account_id: 'salem',
    }],
    meetings: [{ meeting_id: 42, town_id: 1, body_id: 7, title: 'City Council' }],
    governing_bodies: [{ body_id: 7, name: 'City Council' }],
    documents: [{ document_id: 1, meeting_id: 42 }],
    agenda_items: [{ agenda_item_id: 1, sort_order: 1, title: 'Budget', item_text: null }],
    myapp_profile: [{ id: 'user-123', username: 'resident', biography: '', avatar_url: null }],
    user_accounts: [{ user_id: 'user-123', account_role: 'System administrator' }],
  };
});

afterEach(() => {
  vi.mocked(console.error).mockRestore();
  vi.unstubAllEnvs();
});

describe('Sign-in errors (#757)', () => {
  it.each([
    ['invalid_credentials', 'Invalid email or password.'],
    ['email_not_confirmed', 'Confirm your email address before signing in.'],
    ['over_request_rate_limit', 'Too many attempts. Please wait a minute and try again.'],
  ])('maps %s to a fixed message without logging it', async (code, message) => {
    db.authError = { message: TELLING, code };

    await expectFixedMessage(await login(json('http://localhost/api/auth/login', 'POST', CREDENTIALS)), 401, message);
    expect(console.error).not.toHaveBeenCalled();
  });

  it.each([['unexpected_failure'], [undefined]])('sends a general message and logs any other error (code %s)', async (code) => {
    db.authError = { message: TELLING, code };

    await expectFixedMessage(
      await login(json('http://localhost/api/auth/login', 'POST', CREDENTIALS)),
      401,
      'Sign-in failed. Please try again.',
    );
    expectLogged(TELLING);
  });

  it('never logs the email or password', async () => {
    db.authError = { message: TELLING, code: 'unexpected_failure' };

    await login(json('http://localhost/api/auth/login', 'POST', CREDENTIALS));

    const logged = vi.mocked(console.error).mock.calls.flat().join(' ');
    expect(logged).not.toContain(CREDENTIALS.email);
    expect(logged).not.toContain(CREDENTIALS.password);
  });

  it('answers a body that is not JSON with a general message', async () => {
    await expectFixedMessage(
      await login(json('http://localhost/api/auth/login', 'POST', '{not json')),
      500,
      'Something went wrong. Please try again.',
    );
    expectLogged('Sign-in failed');
  });
});

describe('Sign-up errors (#757)', () => {
  it.each([
    ['email_exists', 'An account with this email already exists.'],
    ['user_already_exists', 'An account with this email already exists.'],
    ['weak_password', 'Password is too weak. Try a longer password.'],
    ['email_address_invalid', 'Enter a valid email address.'],
    ['over_request_rate_limit', 'Too many attempts. Please wait a minute and try again.'],
  ])('maps %s to a fixed message without logging it', async (code, message) => {
    db.authError = { message: TELLING, code };

    await expectFixedMessage(await register(json('http://localhost/api/auth/register', 'POST', CREDENTIALS)), 400, message);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('sends a general message and logs any other error', async () => {
    db.authError = { message: TELLING, code: 'unexpected_failure' };

    await expectFixedMessage(
      await register(json('http://localhost/api/auth/register', 'POST', CREDENTIALS)),
      400,
      'The account could not be created. Please try again.',
    );
    expectLogged(TELLING);
  });

  it('answers a body that is not JSON with a general message', async () => {
    await expectFixedMessage(
      await register(json('http://localhost/api/auth/register', 'POST', '{not json')),
      500,
      'Something went wrong. Please try again.',
    );
    expectLogged('Sign-up failed');
  });
});

describe('Profile errors (#757)', () => {
  beforeEach(() => db.failing.add('myapp_profile'));

  it('GET', async () => {
    await expectFixedMessage(
      await getProfile(new Request('http://localhost/api/profile', { headers: AUTH })),
      500,
      'Your profile could not be loaded. Please try again.',
    );
    expectLogged(TELLING);
  });

  it('POST', async () => {
    await expectFixedMessage(
      await createProfile(json('http://localhost/api/profile', 'POST', { username: 'resident' }, AUTH)),
      400,
      'Your profile could not be created. Please try again.',
    );
    expectLogged(TELLING);
  });

  it('PATCH', async () => {
    await expectFixedMessage(
      await saveProfile(json('http://localhost/api/profile', 'PATCH', { biography: 'Hi' }, AUTH)),
      400,
      'Your profile could not be saved. Please try again.',
    );
    expectLogged(TELLING);
  });
});

describe('Avatar errors (#757)', () => {
  it('upload failure', async () => {
    db.uploadFails = true;

    await expectFixedMessage(await uploadAvatar(avatarRequest()), 400, 'The picture could not be uploaded. Please try again.');
    expectLogged(TELLING);
  });

  it('profile update failure', async () => {
    db.failing.add('myapp_profile');

    await expectFixedMessage(
      await uploadAvatar(avatarRequest()),
      400,
      'The picture was uploaded but your profile could not be updated. Please try again.',
    );
    expectLogged(TELLING);
  });
});

describe('Town list errors (#757)', () => {
  it('GET /api/towns', async () => {
    db.failing.add('towns');

    await expectFixedMessage(
      await listTowns(new Request('http://localhost/api/towns', { headers: AUTH })),
      500,
      'The towns could not be loaded. Please try again.',
    );
    expectLogged(TELLING);
  });
});

describe('Meeting list errors (#757)', () => {
  it.each([['towns'], ['meetings'], ['documents']])('GET /api/meetings when %s cannot be read', async (table) => {
    db.failing.add(table);

    await expectFixedMessage(await listMeetings(), 500, 'The meetings could not be loaded. Please try again.');
    expectLogged(TELLING);
  });
});

describe('Meeting detail errors (#757)', () => {
  it.each([['meetings'], ['towns'], ['governing_bodies'], ['documents'], ['agenda_items']])(
    'GET /api/meetings/42 when %s cannot be read',
    async (table) => {
      db.failing.add(table);

      await expectFixedMessage(
        await getMeeting(new Request('http://localhost/api/meetings/42'), { params: { id: '42' } }),
        500,
        'This meeting could not be loaded. Please try again.',
      );
      expectLogged(TELLING);
    },
  );
});

describe('Retrieval errors (#757)', () => {
  it('POST /api/retrieval/meetings when the town cannot be read', async () => {
    db.failing.add('towns');

    await expectFixedMessage(
      await runRetrieval(json('http://localhost/api/retrieval/meetings', 'POST', { townId: 1 }, AUTH)),
      500,
      'The town could not be read. Please try again.',
    );
    expectLogged(TELLING);
  });
});
