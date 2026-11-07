// SRS-104.2, KJ, Catalog entry creation
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  role: {
    data: { account_role: 'System administrator' } as { account_role: string } | null,
    error: null as null | { message: string },
  },
  saved: {
    data: { topic_id: 9, name: 'Parks' } as Record<string, unknown> | null,
    error: null as null | { code?: string; message: string },
  },
  insert: vi.fn(),
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
      return {
        insert: (values: unknown) => {
          db.insert(values);
          return { select: () => ({ single: async () => db.saved }) };
        },
      };
    }),
  })),
}));

import { POST } from '../../app/api/topics/route';

function req(body: unknown, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/topics', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('Catalog entry creation (SRS-104.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.role = { data: { account_role: 'System administrator' }, error: null };
    db.saved = { data: { topic_id: 9, name: 'Parks' }, error: null };
  });

  // Acceptance criterion: the administrator saves a new topic named "Parks" and it is in the catalog.
  it('adds the topic "Parks" when a system administrator saves it', async () => {
    const res = await POST(req({ name: 'Parks' }));

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ topic: { topic_id: 9, name: 'Parks' } });
    expect(db.insert).toHaveBeenCalledWith({ name: 'Parks' });
  });

  it('trims spaces around the topic name', async () => {
    await POST(req({ name: '   Parks   ' }));

    expect(db.insert).toHaveBeenCalledWith({ name: 'Parks' });
  });

  it('rejects a blank topic name and names the missing field', async () => {
    const res = await POST(req({ name: '   ' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Topic name is required.', missingFields: ['name'] });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects a topic name longer than 100 characters', async () => {
    const res = await POST(req({ name: 'a'.repeat(101) }));

    expect(res.status).toBe(400);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('explains when a topic with the same name already exists', async () => {
    db.saved = { data: null, error: { code: '23505', message: 'duplicate key value' } };

    const res = await POST(req({ name: 'Parks' }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('A topic named "Parks" already exists.');
  });

  it('denies a signed-in resident', async () => {
    db.role = { data: { account_role: 'User' }, error: null };

    const res = await POST(req({ name: 'Snow Removal' }));

    expect(res.status).toBe(403);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('returns 401 without a token', async () => {
    const res = await POST(req({ name: 'Parks' }, null));

    expect(res.status).toBe(401);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('returns 500 when the role cannot be read', async () => {
    db.role = { data: null, error: { message: 'database down' } };

    const res = await POST(req({ name: 'Parks' }));

    expect(res.status).toBe(500);
    expect(db.insert).not.toHaveBeenCalled();
  });
});