// SRS-101.5, KJ, Initial topic catalog
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The eight starter topics, exactly as SRS-101.5 lists them.
const STARTER_TOPICS = [
  'Housing',
  'Transportation & Parking',
  'School Budget',
  'Zoning & Land Use',
  'Public Safety',
  'Parks & Recreation',
  'Taxes & Municipal Budget',
  'Environment',
];

const catalog = STARTER_TOPICS.map((name, index) => ({ topic_id: index + 1, name }));

const mockBuilder = {
  select: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(),
  order: vi.fn(async () => ({ data: catalog, error: null })),
};

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (token: string) =>
        token === 'valid-token'
          ? { data: { user: { id: 'resident-1' } }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
      ),
    },
    from: vi.fn(() => mockBuilder),
  })),
}));

import { GET } from '../../app/api/topics/route';

function req(token: string | null = 'valid-token') {
  return new Request('http://localhost/api/topics', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe('Initial topic catalog (SRS-101.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuilder.select.mockReturnThis();
    mockBuilder.is.mockReturnThis();
    mockBuilder.order.mockResolvedValue({ data: catalog, error: null });
  });

  it('seeds exactly the eight starter topics, in order', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/seed_topics.sql'), 'utf8');
    const seeded = [...sql.matchAll(/\(\d+, '([^']+)'\)/g)].map((match) => match[1]);
    expect(seeded).toEqual(STARTER_TOPICS);
  });

  it('returns every topic shown in selection lists, in catalog order', async () => {
    const response = await GET(req());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ topics: catalog });
    expect(mockBuilder.is).toHaveBeenCalledWith('removed_at', null);
    expect(mockBuilder.order).toHaveBeenCalledWith('topic_id');
  });

  it('returns 401 without a token', async () => {
    const response = await GET(req(null));
    expect(response.status).toBe(401);
  });

  it('returns 500 with a message when the catalog cannot be read', async () => {
    mockBuilder.order.mockResolvedValue({ data: null, error: { message: 'boom' } } as never);
    const response = await GET(req());
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe('Topics could not be loaded. Please try again.');
  });
});