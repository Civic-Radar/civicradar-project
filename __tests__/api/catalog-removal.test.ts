// SRS-104.4, KJ, Catalog entry removal
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  role: {
    data: { account_role: 'System administrator' } as { account_role: string } | null,
    error: null as null | { message: string },
  },
  removed: {
    data: null as Record<string, unknown> | null,
    error: null as null | { message: string },
  },
  tables: [] as string[],
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
      db.tables.push(table);
      const chain = {
        update: (values: unknown) => { db.update(values); return chain; },
        eq: (column: string, value: unknown) => { db.eq(column, value); return chain; },
        is: (column: string, value: unknown) => { db.is(column, value); return chain; },
        select: () => chain,
        maybeSingle: async () => db.removed,
      };
      return chain;
    }),
  })),
}));

import { DELETE as removeTown } from '../../app/api/towns/[townId]/route';
import { DELETE as removeTopic } from '../../app/api/topics/[topicId]/route';

function req(token: string | null = 'valid-token') {
  return new Request('http://localhost/api', {
    method: 'DELETE',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe('Catalog entry removal (SRS-104.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.tables = [];
    db.role = { data: { account_role: 'System administrator' }, error: null };
    db.removed = { data: { topic_id: 7, name: 'Parks' }, error: null };
  });

  // Acceptance criterion: removing "Parks" hides it from the resident topic selection section.
  it('removes the topic "Parks" by setting removed_at instead of deleting the row', async () => {
    const res = await removeTopic(req(), { params: { topicId: '7' } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: { topic_id: 7, name: 'Parks' } });
    expect(db.tables).toEqual(['topics']);
    expect(db.update).toHaveBeenCalledWith({ removed_at: expect.any(String) });
    expect(db.eq).toHaveBeenCalledWith('topic_id', 7);
    expect(db.is).toHaveBeenCalledWith('removed_at', null);
  });

  it('removes a town by setting removed_at', async () => {
    db.removed = { data: { town_id: 3, name: 'Test Town' }, error: null };

    const res = await removeTown(req(), { params: { townId: '3' } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: { town_id: 3, name: 'Test Town' } });
    expect(db.tables).toEqual(['towns']);
    expect(db.update).toHaveBeenCalledWith({ removed_at: expect.any(String) });
    expect(db.eq).toHaveBeenCalledWith('town_id', 3);
  });

  it('denies a signed-in resident who tries to remove a topic', async () => {
    db.role = { data: { account_role: 'User' }, error: null };

    const res = await removeTopic(req(), { params: { topicId: '7' } });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Only a system administrator can manage the catalog.' });
    expect(db.update).not.toHaveBeenCalled();
  });

  it('denies a signed-in resident who tries to remove a town', async () => {
    db.role = { data: { account_role: 'User' }, error: null };

    const res = await removeTown(req(), { params: { townId: '3' } });

    expect(res.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('returns 401 without a token', async () => {
    const res = await removeTopic(req(null), { params: { topicId: '7' } });

    expect(res.status).toBe(401);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('returns 404 when the topic does not exist or was already removed', async () => {
    db.removed = { data: null, error: null };

    const res = await removeTopic(req(), { params: { topicId: '7' } });

    expect(res.status).toBe(404);
  });

  it('rejects an invalid id', async () => {
    const res = await removeTopic(req(), { params: { topicId: 'abc' } });

    expect(res.status).toBe(400);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('returns 500 when the removal cannot be saved', async () => {
    db.removed = { data: null, error: { message: 'database down' } };

    const res = await removeTown(req(), { params: { townId: '3' } });

    expect(res.status).toBe(500);
  });
});