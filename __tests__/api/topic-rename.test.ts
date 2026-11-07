// SRS-104.3, KJ, Catalog entry modification
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  role: {
    data: { account_role: 'System administrator' } as { account_role: string } | null,
    error: null as null | { message: string },
  },
  saved: {
    data: { topic_id: 9, name: 'Parks & Playgrounds' } as Record<string, unknown> | null,
    error: null as null | { code?: string; message: string },
  },
  update: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (token: string) =>
        token === 'valid-token'
          ? { data: { user: { id: 'admin-1' } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
      ),
    },
    from: vi.fn((table: string) => {
      if (table === 'user_accounts') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => db.role }) }) };
      }
      const chain = {
        update: (values: unknown) => { db.update(values); return chain; },
        eq: (column: string, value: unknown) => { db.eq(column, value); return chain; },
        is: (column: string, value: unknown) => { db.is(column, value); return chain; },
        select: () => chain,
        maybeSingle: async () => db.saved,
      };
      return chain;
    }),
  })),
}));

import { PATCH } from '../../app/api/topics/[topicId]/route';

function req(body: unknown, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/topics/9', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const params = { params: { topicId: '9' } };

describe('Catalog entry modification (SRS-104.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.role = { data: { account_role: 'System administrator' }, error: null };
    db.saved = { data: { topic_id: 9, name: 'Parks & Playgrounds' }, error: null };
  });

  // Acceptance criterion: the administrator renames "Parks" and the catalog shows the new name.
  it('renames the topic when a system administrator saves a new name', async () => {
    const res = await PATCH(req({ name: 'Parks & Playgrounds' }), params);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ topic: { topic_id: 9, name: 'Parks & Playgrounds' } });
    expect(db.update).toHaveBeenCalledWith({ name: 'Parks & Playgrounds' });
    expect(db.eq).toHaveBeenCalledWith('topic_id', 9);
    expect(db.is).toHaveBeenCalledWith('removed_at', null);
  });

  it('only changes the name, so follows that point at topic_id stay attached', async () => {
    await PATCH(req({ name: 'Parks & Playgrounds' }), params);

    expect(db.update).toHaveBeenCalledTimes(1);
    expect(Object.keys(db.update.mock.calls[0][0] as object)).toEqual(['name']);
  });

  it('trims spaces around the new name', async () => {
    await PATCH(req({ name: '  Parks & Playgrounds  ' }), params);

    expect(db.update).toHaveBeenCalledWith({ name: 'Parks & Playgrounds' });
  });

  it('rejects a blank name', async () => {
    const res = await PATCH(req({ name: '   ' }), params);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Topic name is required.', missingFields: ['name'] });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('explains when another topic already has the new name', async () => {
    db.saved = { data: null, error: { code: '23505', message: 'duplicate key value' } };

    const res = await PATCH(req({ name: 'Parks & Recreation' }), params);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('A topic named "Parks & Recreation" already exists.');
  });

  it('returns 404 when the topic does not exist or was removed', async () => {
    db.saved = { data: null, error: null };

    const res = await PATCH(req({ name: 'Parks & Playgrounds' }), params);

    expect(res.status).toBe(404);
  });

  it('rejects an invalid topic id', async () => {
    const res = await PATCH(req({ name: 'Parks & Playgrounds' }), { params: { topicId: 'abc' } });

    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('denies a signed-in resident', async () => {
    db.role = { data: { account_role: 'User' }, error: null };

    const res = await PATCH(req({ name: 'Snow Removal' }), params);

    expect(res.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('returns 401 without a token', async () => {
    const res = await PATCH(req({ name: 'Parks & Playgrounds' }, null), params);

    expect(res.status).toBe(401);
    expect(db.update).not.toHaveBeenCalled();
  });
});