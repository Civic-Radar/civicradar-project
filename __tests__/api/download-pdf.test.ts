import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentIdentification, DocumentState } from '../../app/(app)/documents/[id]/useDocument';

// SRS-214.1 (Download PDF button), SRS-214.2 (byte-identical download) and
// SRS-214.3 (Town_Body_YYYY-MM-DD_Type.pdf file name).

const { renderToStaticMarkup } = createRequire(import.meta.url)('react-dom/server') as {
  renderToStaticMarkup: (element: React.ReactElement) => string;
};

type Row = Record<string, unknown>;
type Result = { data: unknown; error: { message: string } | null };

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 10, 1, 2, 3]); // "%PDF-1.7\n..."
const SHA256 = createHash('sha256').update(PDF_BYTES).digest('hex');
const SIGNED_URL = 'https://example.supabase.co/storage/v1/object/sign/documents/1/1168.pdf?token=signed-token';
const STORAGE_PARTS = ['supabase', 'storage/v1', '1/1168.pdf', 'signed-token', 'Object not found'];

const db = vi.hoisted(() => ({
  rows: {} as Record<string, Row | null>,
  failing: new Set<string>(),
  signError: false,
}));
const hook = vi.hoisted(() => ({ state: { status: 'loading' } as DocumentState }));

vi.mock('../../lib/supabase', () => {
  function chain(table: string) {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq']) builder[method] = () => builder;
    builder.maybeSingle = async (): Promise<Result> =>
      db.failing.has(table) ? { data: null, error: { message: `relation ${table} is broken` } } : { data: db.rows[table] ?? null, error: null };
    return builder;
  }
  return {
    getSupabaseClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn(async (token: string) =>
          token === 'valid-token'
            ? { data: { user: { id: 'user-123' } }, error: null }
            : { data: { user: null }, error: { message: 'Invalid token' } },
        ),
      },
      from: vi.fn((table: string) => chain(table)),
      storage: {
        from: vi.fn(() => ({
          createSignedUrl: vi.fn(async () =>
            db.signError ? { data: null, error: { message: 'Object not found' } } : { data: { signedUrl: SIGNED_URL }, error: null },
          ),
        })),
      },
    })),
  };
});

vi.mock('../../app/(app)/documents/[id]/useDocument', () => ({ useDocument: () => hook.state }));

import { GET as download } from '../../app/api/documents/[id]/download/route';
import DocumentDetailPage from '../../app/(app)/documents/[id]/page';
import { attachmentFileName } from '../../app/(app)/documents/[id]/DownloadPdfButton';

function request(id = '60', token: string | null = 'valid-token') {
  return download(
    new Request(`http://localhost/api/documents/${id}/download`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
    { params: { id } },
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
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  db.failing.clear();
  db.signError = false;
  db.rows = {
    documents: {
      town_id: 1,
      source_file_id: '1168',
      storage_path: '1/1168.pdf',
      mime_type: 'application/pdf',
      file_sha256: SHA256,
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url !== SIGNED_URL) throw new Error(`unexpected fetch ${url}`);
      return new Response(PDF_BYTES, { status: 200, headers: { 'content-type': 'application/pdf', 'x-supabase-thing': 'yes' } });
    }),
  );
});

afterEach(() => {
  vi.mocked(console.error).mockRestore();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  hook.state = { status: 'loading' };
});

describe('GET /api/documents/[id]/download (SRS-214.1)', () => {
  it('sends the stored PDF as a download, with no Storage details', async () => {
    const response = await request();

    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.clone().arrayBuffer())).toEqual(PDF_BYTES);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="[^"]+\.pdf"$/);
    expect(response.headers.get('content-length')).toBe(String(PDF_BYTES.byteLength));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    await expectNothingStorageRelated(response);
  });

  it.each([
    ['no token', null, 'Unauthorized'],
    ['a bad token', 'bad-token', 'Invalid or expired token.'],
  ])('refuses %s with 401', async (_label, token, error) => {
    const response = await request('60', token);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a bad document id with 400', async () => {
    const response = await request('abc');

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid document id.' });
  });

  it('answers 404 for a document that does not exist', async () => {
    db.rows.documents = null;

    const response = await request();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Document not found.' });
  });

  it('answers 404, with no Storage details, when there is no stored PDF', async () => {
    db.signError = true;

    const response = await request();

    expect(response.status).toBe(404);
    expect(await response.clone().json()).toEqual({ error: 'The PDF is not available.' });
    await expectNothingStorageRelated(response);
  });

  it('answers 500 with a fixed message, and logs, when the document cannot be read', async () => {
    db.failing.add('documents');

    const response = await request();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'The PDF is not available.' });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('relation documents is broken'));
  });

  it.each([
    ['answers 500', async () => new Response('Object not found', { status: 500 })],
    ['cannot be reached', async () => { throw new Error('Object not found: network down'); }],
  ])('answers 502, with no Storage details, when Storage %s', async (_label, impl) => {
    vi.mocked(fetch).mockImplementation(impl as never);

    const response = await request();

    expect(response.status).toBe(502);
    expect(await response.clone().json()).toEqual({ error: 'The PDF is not available.' });
    await expectNothingStorageRelated(response);
  });
});

describe('Download PDF button on the document detail page (SRS-214.1)', () => {
  function document(pdfUrl: string | null): DocumentIdentification {
    return {
      document_id: 60,
      meeting_id: 42,
      town_id: 1,
      title: 'City Council Agenda Packet',
      document_type: 'Packet',
      source_url: 'https://example.org/files/60.pdf',
      retrieved_at: '2026-10-01T12:00:00+00:00',
      summary_status: 'Pending',
      summary_text: null,
      summary_generated_at: null,
      pdf_url: pdfUrl,
    };
  }

  function render(pdfUrl: string | null): string {
    vi.stubGlobal('React', React);
    hook.state = { status: 'loaded', document: document(pdfUrl) };
    return renderToStaticMarkup(React.createElement(DocumentDetailPage, { params: { id: '60' } }));
  }

  function downloadButton(markup: string): string | undefined {
    return markup.match(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*Download PDF<\/button>/)?.[0];
  }

  it('shows a Download PDF button, enabled, when the document has a stored PDF', () => {
    const button = downloadButton(render('/api/documents/60/pdf?ticket=1.AAAA'));

    expect(button).toBeDefined();
    expect(button).not.toContain('disabled=""');
  });

  it('still shows the button, disabled, when there is no stored PDF', () => {
    const button = downloadButton(render(null));

    expect(button).toBeDefined();
    expect(button).toContain('disabled=""');
  });

  it('shows no button while the page is loading or the document is not found', () => {
    vi.stubGlobal('React', React);
    for (const state of [{ status: 'loading' }, { status: 'notFound' }] as DocumentState[]) {
      hook.state = state;
      expect(renderToStaticMarkup(React.createElement(DocumentDetailPage, { params: { id: '60' } }))).not.toContain('Download PDF');
    }
  });

  it('saves the file under the name the route sends', () => {
    expect(attachmentFileName('attachment; filename="document-60.pdf"', 'x.pdf')).toBe('document-60.pdf');
    expect(attachmentFileName(null, 'document-60.pdf')).toBe('document-60.pdf');
  });
});
