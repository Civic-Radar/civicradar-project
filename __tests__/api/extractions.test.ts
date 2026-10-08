// Tests for SRS-301.4 (Extraction request), plus SRS-301.5 / 301.6 / 306.3.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = { id: 'user-123', email: 'ao@example.com' };

const pdfDocument = { document_id: 10, title: 'City Council Regular Meeting - Agenda', mime_type: 'application/pdf' };
const wordDocument = { document_id: 11, title: 'Planning Board Notes', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

const createdExtraction = {
  extraction_id: 1,
  user_id: USER.id,
  document_id: 10,
  source_document_title: pdfDocument.title,
  status: 'Queued',
  requested_at: '2026-10-08T16:00:00Z',
  completed_at: null,
};

// One fake query builder per table so each test can control what that table returns.
function makeBuilder() {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn(async () => ({ error: null })),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    single: vi.fn(async () => ({ data: null, error: null })),
  };
}

let builders: Record<string, ReturnType<typeof makeBuilder>> = {};

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (token: string) =>
        token === 'valid-token'
          ? { data: { user: USER }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
      ),
    },
    from: vi.fn((table: string) => builders[table]),
  })),
}));

import { GET, POST } from '../../app/api/extractions/route';
import { UNSUPPORTED_FORMAT_MESSAGE, ALREADY_IN_PROGRESS_MESSAGE } from '../../lib/extractions';

function post(body: object | undefined, token: string | null = 'valid-token') {
  return new Request('http://localhost/api/extractions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('POST /api/extractions (SRS-301.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    builders = {
      documents: makeBuilder(),
      user_accounts: makeBuilder(),
      extractions: makeBuilder(),
    };
    builders.documents.maybeSingle.mockResolvedValue({ data: pdfDocument, error: null });
    builders.extractions.single.mockResolvedValue({ data: createdExtraction, error: null });
  });

  it('creates exactly one extraction request for the selected document, linked to the user', async () => {
    const response = await POST(post({ document_id: 10 }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ extraction: createdExtraction });

    // Exactly one insert, for document 10, owned by the signed-in user, starting as Queued.
    expect(builders.extractions.insert).toHaveBeenCalledTimes(1);
    expect(builders.extractions.insert).toHaveBeenCalledWith({
      user_id: USER.id,
      document_id: 10,
      source_document_title: pdfDocument.title,
      status: 'Queued',
    });
  });

  it('links the request to the token owner even if the body names another user', async () => {
    await POST(post({ document_id: 10, user_id: 'someone-else' }));

    const inserted = builders.extractions.insert.mock.calls[0][0];
    expect(inserted.user_id).toBe(USER.id);
  });

  it('makes sure the user_accounts row exists before inserting', async () => {
    await POST(post({ document_id: 10 }));

    expect(builders.user_accounts.upsert).toHaveBeenCalledWith(
      { user_id: USER.id, email: USER.email },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );
  });

  it('returns 401 and creates nothing when not signed in', async () => {
    const response = await POST(post({ document_id: 10 }, null));

    expect(response.status).toBe(401);
    expect(builders.extractions.insert).not.toHaveBeenCalled();
  });

  it('returns 401 and creates nothing for an invalid token', async () => {
    const response = await POST(post({ document_id: 10 }, 'bad-token'));

    expect(response.status).toBe(401);
    expect(builders.extractions.insert).not.toHaveBeenCalled();
  });

  it('returns 400 when no document is selected', async () => {
    const response = await POST(post({}));

    expect(response.status).toBe(400);
    expect(builders.extractions.insert).not.toHaveBeenCalled();
  });

  it('returns 404 when the document does not exist', async () => {
    builders.documents.maybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await POST(post({ document_id: 999 }));

    expect(response.status).toBe(404);
    expect(builders.extractions.insert).not.toHaveBeenCalled();
  });

  it('SRS-301.5/301.6: rejects a non-PDF with the exact message and creates no request', async () => {
    builders.documents.maybeSingle.mockResolvedValue({ data: wordDocument, error: null });

    const response = await POST(post({ document_id: 11 }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: UNSUPPORTED_FORMAT_MESSAGE });
    expect(builders.extractions.insert).not.toHaveBeenCalled();
  });

  it('SRS-306.3: refuses a second request while the same document is still in progress', async () => {
    builders.extractions.single.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint "extractions_in_flight_uq"' },
    });

    const response = await POST(post({ document_id: 10 }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: ALREADY_IN_PROGRESS_MESSAGE });
  });

  it('does not leak database error details to the user', async () => {
    builders.extractions.single.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'internal error at line 42' },
    });

    const response = await POST(post({ document_id: 10 }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).not.toContain('line 42');
  });
});

describe('GET /api/extractions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    builders = { extractions: makeBuilder() };
  });

  it("returns only the signed-in user's extractions", async () => {
    builders.extractions.order.mockResolvedValue({ data: [createdExtraction], error: null } as never);

    const response = await GET(new Request('http://localhost/api/extractions', {
      headers: { authorization: 'Bearer valid-token' },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ extractions: [createdExtraction] });
    expect(builders.extractions.eq).toHaveBeenCalledWith('user_id', USER.id);
  });

  it('returns 401 without a token', async () => {
    const response = await GET(new Request('http://localhost/api/extractions'));
    expect(response.status).toBe(401);
  });
});
