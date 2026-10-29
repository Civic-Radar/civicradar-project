// SRS-104.6, KJ, Town source settings
// SRS-104.1, KJ, Catalog management access
import { beforeEach, describe, expect, it, vi } from 'vitest';

const salem = {
  town_id: 1,
  name: 'Salem',
  source_account_id: 'salemma',
  meeting_time_zone: 'America/New_York',
};

const mockBuilder = {
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  order: vi.fn(async () => ({ data: [salem], error: null })),
  single: vi.fn(async () => ({ data: salem, error: null })),
  maybeSingle: vi.fn(async () => ({ data: salem, error: null })),
};

// What the user_accounts lookup returns for the signed-in user.
const role = vi.hoisted(() => ({
  result: {
    data: { account_role: 'System administrator' } as { account_role: string } | null,
    error: null as null | { message: string },
  },
}));

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (token: string) => {
        if (token === 'valid-token') {
          return { data: { user: { id: 'admin-1' } }, error: null };
        }
        return { data: { user: null }, error: { message: 'Invalid token' } };
      }),
    },
    from: vi.fn((table: string) =>
      table === 'user_accounts'
        ? { select: () => ({ eq: () => ({ maybeSingle: async () => role.result }) }) }
        : mockBuilder,
    ),
  })),
}));

import { GET, POST } from '../../app/api/towns/route';
import { PATCH } from '../../app/api/towns/[townId]/route';

function req(method: string, body?: object, token = 'valid-token') {
  return new Request('http://localhost/api/towns', {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const salemInput = { name: 'Salem', source_account_id: 'salemma', meeting_time_zone: 'America/New_York' };

beforeEach(() => {
  vi.clearAllMocks();
  mockBuilder.select.mockReturnThis();
  mockBuilder.insert.mockReturnThis();
  mockBuilder.update.mockReturnThis();
  mockBuilder.eq.mockReturnThis();
  mockBuilder.is.mockReturnThis();
  mockBuilder.order.mockResolvedValue({ data: [salem], error: null });
  mockBuilder.single.mockResolvedValue({ data: salem, error: null });
  mockBuilder.maybeSingle.mockResolvedValue({ data: salem, error: null });
  role.result = { data: { account_role: 'System administrator' }, error: null };
});

describe('Town source settings (SRS-104.6)', () => {
  // Acceptance criterion 1
  it('saves Salem with source account identifier "salemma" and time zone America/New_York', async () => {
    const response = await POST(req('POST', salemInput));

    expect(response.status).toBe(201);
    expect(mockBuilder.insert).toHaveBeenCalledWith(salemInput);
    expect(await response.json()).toEqual({ town: salem });
  });

  // Acceptance criterion 2
  it('rejects a new town with a blank source account identifier and names the missing field', async () => {
    const response = await POST(
      req('POST', { name: 'Salem', source_account_id: '', meeting_time_zone: 'America/New_York' }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Source account identifier is required.',
      missingFields: ['source_account_id'],
    });
    expect(mockBuilder.insert).not.toHaveBeenCalled();
  });

  it('treats a source account identifier of only spaces as blank', async () => {
    const response = await POST(
      req('POST', { name: 'Salem', source_account_id: '   ', meeting_time_zone: 'America/New_York' }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).missingFields).toEqual(['source_account_id']);
    expect(mockBuilder.insert).not.toHaveBeenCalled();
  });

  it('rejects a new town with a blank meeting time zone and names the missing field', async () => {
    const response = await POST(req('POST', { name: 'Salem', source_account_id: 'salemma' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Meeting time zone is required.',
      missingFields: ['meeting_time_zone'],
    });
    expect(mockBuilder.insert).not.toHaveBeenCalled();
  });

  it('rejects an edited town when the source account identifier is cleared', async () => {
    const response = await PATCH(
      req('PATCH', { name: 'Salem', source_account_id: '', meeting_time_zone: 'America/New_York' }),
      { params: { townId: '1' } },
    );

    expect(response.status).toBe(400);
    expect((await response.json()).missingFields).toEqual(['source_account_id']);
    expect(mockBuilder.update).not.toHaveBeenCalled();
  });

  it('saves an edited town that has both values', async () => {
    const response = await PATCH(req('PATCH', salemInput), { params: { townId: '1' } });

    expect(response.status).toBe(200);
    expect(mockBuilder.update).toHaveBeenCalledWith(salemInput);
    expect(mockBuilder.eq).toHaveBeenCalledWith('town_id', 1);
  });

  it('explains a duplicate source account identifier', async () => {
    mockBuilder.single.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "towns_source_account_id_key"' },
    } as never);

    const response = await POST(req('POST', salemInput));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('A town with source account identifier "salemma" already exists.');
  });

  it('returns 401 without a token', async () => {
    const response = await POST(new Request('http://localhost/api/towns', { method: 'POST' }));
    expect(response.status).toBe(401);
  });

  it('lists towns for the settings page', async () => {
    const response = await GET(req('GET'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ towns: [salem] });
  });
});

describe('Catalog management access (SRS-104.1)', () => {
  it('lets a signed-in system administrator add a town', async () => {
    const response = await POST(req('POST', salemInput));

    expect(response.status).toBe(201);
    expect(mockBuilder.insert).toHaveBeenCalled();
  });

  it('denies a signed-in resident who tries to add a town', async () => {
    role.result = { data: { account_role: 'User' }, error: null };

    const response = await POST(req('POST', salemInput));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Only a system administrator can manage the catalog.' });
    expect(mockBuilder.insert).not.toHaveBeenCalled();
  });

  it('denies a signed-in resident who tries to edit a town', async () => {
    role.result = { data: { account_role: 'User' }, error: null };

    const response = await PATCH(req('PATCH', salemInput), { params: { townId: '1' } });

    expect(response.status).toBe(403);
    expect(mockBuilder.update).not.toHaveBeenCalled();
  });

  it('treats an account with no user_accounts row as not an administrator', async () => {
    role.result = { data: null, error: null };

    const response = await POST(req('POST', salemInput));

    expect(response.status).toBe(403);
    expect(mockBuilder.insert).not.toHaveBeenCalled();
  });

  it('returns 500 when the role cannot be read', async () => {
    role.result = { data: null, error: { message: 'database down' } };

    const response = await POST(req('POST', salemInput));

    expect(response.status).toBe(500);
    expect(mockBuilder.insert).not.toHaveBeenCalled();
  });

  it('still lets a signed-in resident list towns', async () => {
    role.result = { data: { account_role: 'User' }, error: null };

    const response = await GET(req('GET'));

    expect(response.status).toBe(200);
  });
});