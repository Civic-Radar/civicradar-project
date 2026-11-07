// SRS-101.7, KJ, Resident catalog restriction
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  role: 'User' as string,
  writes: [] as string[],
}));

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'resident-1' } }, error: null })),
    },
    from: vi.fn((table: string) => {
      if (table === 'user_accounts') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { account_role: db.role }, error: null }) }) }),
        };
      }
      // Any write to the topics table is recorded, so the tests can prove the catalog is unchanged.
      const chain: Record<string, unknown> = {};
      const record = (kind: string) => () => { db.writes.push(`${table}.${kind}`); return chain; };
      Object.assign(chain, {
        insert: record('insert'),
        update: record('update'),
        delete: record('delete'),
        eq: () => chain,
        is: () => chain,
        select: () => chain,
        single: async () => ({ data: { topic_id: 1, name: 'Snow Removal' }, error: null }),
        maybeSingle: async () => ({ data: { topic_id: 1, name: 'Snow Removal' }, error: null }),
      });
      return chain;
    }),
  })),
}));

import { POST } from '../../app/api/topics/route';
import { DELETE, PATCH } from '../../app/api/topics/[topicId]/route';

function req(method: string, body?: unknown) {
  return new Request('http://localhost/api/topics', {
    method,
    headers: { 'content-type': 'application/json', authorization: 'Bearer resident-token' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = { params: { topicId: '1' } };
const DENIED = { error: 'Only a system administrator can manage the catalog.' };

describe('Resident catalog restriction (SRS-101.7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.role = 'User';
    db.writes = [];
  });

  // Acceptance criterion: a resident asks to add "Snow Removal"; the request is denied and the catalog is unchanged.
  it('denies a resident who asks to add the topic "Snow Removal"', async () => {
    const res = await POST(req('POST', { name: 'Snow Removal' }));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(DENIED);
    expect(db.writes).toEqual([]);
  });

  it('denies a resident who asks to rename a topic', async () => {
    const res = await PATCH(req('PATCH', { name: 'Snow Removal' }), params);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(DENIED);
    expect(db.writes).toEqual([]);
  });

  it('denies a resident who asks to remove a topic', async () => {
    const res = await DELETE(req('DELETE'), params);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual(DENIED);
    expect(db.writes).toEqual([]);
  });

  it('denies an account with no role row the same way', async () => {
    db.role = '';

    const res = await POST(req('POST', { name: 'Snow Removal' }));

    expect(res.status).toBe(403);
    expect(db.writes).toEqual([]);
  });

  it('still lets a system administrator add a topic (control case)', async () => {
    db.role = 'System administrator';

    const res = await POST(req('POST', { name: 'Snow Removal' }));

    expect(res.status).toBe(201);
    expect(db.writes).toEqual(['topics.insert']);
  });
});