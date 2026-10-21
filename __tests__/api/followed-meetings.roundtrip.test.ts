import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MeetingRow = { meeting_id: number; title: string };
type AccountRow = { user_id: string; email: string };
type FollowRow = { user_id: string; meeting_id: number };

// An in-memory stand-in for the three tables the route uses, so a follow made
// by one request is visible to a later request. It models only the calls the
// route makes today and throws on anything else.
const store = vi.hoisted(() => ({
  meetings: [] as MeetingRow[],
  accounts: [] as AccountRow[],
  follows: [] as FollowRow[],
}));

vi.mock('../../lib/supabase', () => {
  // Two tokens for resident 1 stand for two separate sign-ins.
  const residents: Record<string, { id: string; email: string }> = {
    'token-resident-1-first-sign-in': { id: 'resident-1', email: 'one@example.com' },
    'token-resident-1-second-sign-in': { id: 'resident-1', email: 'one@example.com' },
    'token-resident-2': { id: 'resident-2', email: 'two@example.com' },
  };

  type Query = {
    operation: string;
    payload: unknown;
    options: unknown;
    filters: { column: unknown; value: unknown }[];
    single: boolean;
  };

  function unsupported(table: string, query: Query): never {
    throw new Error(`The stand-in does not model this call: ${table} ${JSON.stringify(query)}`);
  }

  function run(table: string, query: Query) {
    const columns = query.filters.map((filter) => filter.column).join(',');
    const shape = `${table}.${query.operation}(${columns})${query.single ? '.maybeSingle' : ''}`;
    const value = (column: string) => query.filters.find((filter) => filter.column === column)?.value;
    const sameOptions = (expected: object) => JSON.stringify(query.options) === JSON.stringify(expected);

    if (shape === 'meetings.select(meeting_id).maybeSingle') {
      const row = store.meetings.find((meeting) => meeting.meeting_id === value('meeting_id'));
      return { data: row ? { meeting_id: row.meeting_id } : null, error: null };
    }

    if (shape === 'user_followed_meetings.select(user_id,meeting_id).maybeSingle') {
      const row = store.follows.find(
        (follow) => follow.user_id === value('user_id') && follow.meeting_id === value('meeting_id'),
      );
      return { data: row ? { meeting_id: row.meeting_id } : null, error: null };
    }

    if (shape === 'user_accounts.upsert()') {
      if (!sameOptions({ onConflict: 'user_id', ignoreDuplicates: true })) unsupported(table, query);
      const row = query.payload as AccountRow;
      if (!store.accounts.some((account) => account.user_id === row.user_id)) store.accounts.push({ ...row });
      return { data: null, error: null };
    }

    // Same outcome as the real table: foreign keys to user_accounts and
    // meetings, and the (user_id, meeting_id) primary key with ON CONFLICT DO NOTHING.
    if (shape === 'user_followed_meetings.upsert()') {
      if (!sameOptions({ onConflict: 'user_id,meeting_id', ignoreDuplicates: true })) unsupported(table, query);
      const row = query.payload as FollowRow;
      const allowed =
        store.accounts.some((account) => account.user_id === row.user_id) &&
        store.meetings.some((meeting) => meeting.meeting_id === row.meeting_id);
      if (!allowed) return { data: null, error: { message: 'foreign key violation' } };
      const exists = store.follows.some(
        (follow) => follow.user_id === row.user_id && follow.meeting_id === row.meeting_id,
      );
      if (!exists) store.follows.push({ user_id: row.user_id, meeting_id: row.meeting_id });
      return { data: null, error: null };
    }

    // Same outcome as DELETE ... WHERE user_id = $1 AND meeting_id = $2: removes
    // the matching row, and matching no row is not an error.
    if (shape === 'user_followed_meetings.delete(user_id,meeting_id)') {
      store.follows = store.follows.filter(
        (follow) => !(follow.user_id === value('user_id') && follow.meeting_id === value('meeting_id')),
      );
      return { data: null, error: null };
    }

    return unsupported(table, query);
  }

  function from(table: string) {
    const query: Query = { operation: '', payload: undefined, options: undefined, filters: [], single: false };
    const builder = {
      select() { query.operation = 'select'; return builder; },
      upsert(payload: unknown, options: unknown) {
        query.operation = 'upsert'; query.payload = payload; query.options = options; return builder;
      },
      delete() { query.operation = 'delete'; return builder; },
      eq(column: unknown, value: unknown) { query.filters.push({ column, value }); return builder; },
      maybeSingle() { query.single = true; return builder; },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        return Promise.resolve().then(() => run(table, query)).then(resolve, reject);
      },
    };
    return builder;
  }

  return {
    getSupabaseClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn(async (token: string) => {
          const user = residents[token];
          return user
            ? { data: { user }, error: null }
            : { data: { user: null }, error: { message: 'Invalid token' } };
        }),
      },
      from,
    })),
  };
});

import { DELETE, GET, PUT } from '../../app/api/followed-meetings/[meetingId]/route';

const FIRST_SIGN_IN = 'token-resident-1-first-sign-in';
const SECOND_SIGN_IN = 'token-resident-1-second-sign-in';
const RESIDENT_2 = 'token-resident-2';

function request(method: string, token: string, meetingId: number) {
  return new Request(`http://localhost/api/followed-meetings/${meetingId}`, {
    method,
    headers: { authorization: `Bearer ${token}` },
  });
}

async function follow(token: string, meetingId: number) {
  return PUT(request('PUT', token, meetingId), { params: { meetingId: String(meetingId) } });
}

async function unfollow(token: string, meetingId: number) {
  return DELETE(request('DELETE', token, meetingId), { params: { meetingId: String(meetingId) } });
}

// A fresh request with nothing carried over but the stored rows, which is what
// reloading the page or signing out and back in depends on.
async function isFollowed(token: string, meetingId: number): Promise<boolean> {
  const response = await GET(request('GET', token, meetingId), { params: { meetingId: String(meetingId) } });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.meeting_id).toBe(meetingId);
  return body.followed;
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  // Real meetings from the Salem dev data. The SRS example uses meeting 1192,
  // which the dev database does not have, so meeting 1 plays its part.
  store.meetings = [
    { meeting_id: 1, title: 'City Council Regular Meeting' },
    { meeting_id: 5, title: 'City Council Regular Meeting' },
    { meeting_id: 9, title: 'Salem City Council Regular Meeting September 24, 2026' },
  ];
  // Registration creates only the auth user, so no account rows exist yet.
  store.accounts = [];
  store.follows = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Follow a meeting round trip (SRS-404.1)', () => {
  it('keeps meeting 1 followed after signing out and back in, with no similar-title meeting added', async () => {
    expect((await follow(FIRST_SIGN_IN, 1)).status).toBe(200);

    expect(await isFollowed(SECOND_SIGN_IN, 1)).toBe(true);
    expect(await isFollowed(SECOND_SIGN_IN, 5)).toBe(false);
    expect(await isFollowed(SECOND_SIGN_IN, 9)).toBe(false);
    expect(store.follows).toEqual([{ user_id: 'resident-1', meeting_id: 1 }]);
  });

  it('stores one follow when meeting 1 is followed twice', async () => {
    expect((await follow(FIRST_SIGN_IN, 1)).status).toBe(200);
    expect((await follow(SECOND_SIGN_IN, 1)).status).toBe(200);

    expect(store.follows).toEqual([{ user_id: 'resident-1', meeting_id: 1 }]);
  });

  it('does not follow the meeting for another resident', async () => {
    await follow(FIRST_SIGN_IN, 1);

    expect(await isFollowed(RESIDENT_2, 1)).toBe(false);
    expect(store.follows.filter((row) => row.user_id === 'resident-2')).toEqual([]);
  });

  it('does not add a meeting that does not exist', async () => {
    const response = await follow(FIRST_SIGN_IN, 9999);

    expect(response.status).toBe(404);
    expect(store.follows).toEqual([]);
  });
});

describe('Unfollow a meeting round trip (SRS-404.2)', () => {
  it('leaves meeting 1 not followed after signing back in, and keeps other followed meetings', async () => {
    await follow(FIRST_SIGN_IN, 1);
    await follow(FIRST_SIGN_IN, 9);

    expect((await unfollow(FIRST_SIGN_IN, 1)).status).toBe(200);

    expect(await isFollowed(SECOND_SIGN_IN, 1)).toBe(false);
    expect(await isFollowed(SECOND_SIGN_IN, 9)).toBe(true);
    expect(store.follows).toEqual([{ user_id: 'resident-1', meeting_id: 9 }]);
  });

  it('removes only the exact meeting id, not a meeting with the same title', async () => {
    await follow(FIRST_SIGN_IN, 1);
    await follow(FIRST_SIGN_IN, 5);

    await unfollow(FIRST_SIGN_IN, 1);

    expect(await isFollowed(SECOND_SIGN_IN, 1)).toBe(false);
    expect(await isFollowed(SECOND_SIGN_IN, 5)).toBe(true);
  });

  it("does not remove another resident's follow of the same meeting", async () => {
    await follow(FIRST_SIGN_IN, 1);
    await follow(RESIDENT_2, 1);

    await unfollow(FIRST_SIGN_IN, 1);

    expect(await isFollowed(SECOND_SIGN_IN, 1)).toBe(false);
    expect(await isFollowed(RESIDENT_2, 1)).toBe(true);
  });

  it('is safe to repeat and to use on a meeting that is not followed', async () => {
    await follow(FIRST_SIGN_IN, 9);

    for (const meetingId of [1, 1, 5]) {
      const response = await unfollow(FIRST_SIGN_IN, meetingId);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ meeting_id: meetingId, followed: false });
    }

    expect(store.follows).toEqual([{ user_id: 'resident-1', meeting_id: 9 }]);
  });
});
