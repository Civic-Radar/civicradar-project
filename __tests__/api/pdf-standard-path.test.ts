import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error: { message: string } | null };

// The detail route reads one documents row; the test sets it.
const db = vi.hoisted(() => ({ row: null as Record<string, unknown> | null }));

// Storage: only the paths in `files` exist. createSignedUrl signs those and
// answers "Object not found" for any other path; download returns their bytes.
const storage = vi.hoisted(() => ({
  files: new Map<string, string>(),
  signCalls: [] as string[],
  downloadCalls: [] as string[],
}));

vi.mock('../../lib/supabase', () => {
  function chain(): Record<string, unknown> {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'maybeSingle']) {
      builder[method] = () => builder;
    }
    builder.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({ data: db.row, error: null }).then(resolve, reject);
    return builder;
  }

  return {
    getSupabaseClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: { id: 'user-123' } }, error: null })),
      },
      from: vi.fn(() => chain()),
      storage: { from: vi.fn(() => fakeBucket()) },
    })),
  };

  function fakeBucket() {
    return {
      createSignedUrl: vi.fn(async (path: string) => {
        storage.signCalls.push(path);
        return storage.files.has(path)
          ? { data: { signedUrl: `https://example.supabase.co/sign/documents/${path}?token=t` }, error: null }
          : { data: null, error: { message: 'Object not found' } };
      }),
      download: vi.fn(async (path: string) => {
        storage.downloadCalls.push(path);
        const text = storage.files.get(path);
        return text === undefined
          ? { data: null, error: { status: 400, statusCode: '404', message: 'Object not found' } }
          : { data: new Blob([text]), error: null };
      }),
    };
  }
});

import { getSupabaseClient } from '../../lib/supabase';
import { GET } from '../../app/api/documents/[id]/route';
import { readStoredPdf } from '../../lib/summaries/readStoredPdf';
import { standardStoragePath } from '../../lib/retrieval/storeDocumentFile';

const CONSOLE_METHODS = ['log', 'error', 'warn', 'info', 'debug'] as const;

// Document 15 as the Salem seed script left it (#514): the recorded path has
// no file, and the file is stored where retrieval stores every file.
const SEEDED_ROW = {
  document_id: 15,
  meeting_id: 9,
  town_id: 1,
  source_file_id: '1168',
  title: 'Salem City Council Regular Meeting September 10, 2026 - Minutes',
  document_type: 'Minutes',
  source_url: 'https://example.test/event/1191/overview',
  retrieved_at: '2026-10-13T12:00:00+00:00',
  summary_status: 'Pending',
  summary_text: null,
  summary_generated_at: null,
  storage_path: 'civicclerk/salemma/1168.pdf',
  mime_type: 'application/pdf',
};

async function openDocument(id = '15') {
  const response = await GET(
    new Request(`http://localhost/api/documents/${id}`, { headers: { authorization: 'Bearer valid-token' } }),
    { params: { id } },
  );
  return (await response.json()) as { document: { pdf_url: string | null } };
}

// The detail route's link to the stored PDF, on our own domain (#726).
const OWN_LINK = /^\/api\/documents\/15\/pdf\?ticket=\d+\.[A-Za-z0-9_-]{43}$/;

beforeEach(() => {
  db.row = null;
  storage.files.clear();
  storage.signCalls.length = 0;
  storage.downloadCalls.length = 0;
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role');
  vi.stubEnv('PDF_LINK_SECRET', 'test-pdf-link-secret');
  for (const method of CONSOLE_METHODS) {
    vi.spyOn(console, method).mockImplementation(() => {});
  }
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('standardStoragePath (SRS-208.3)', () => {
  it('is <town_id>/<source_file_id>.pdf for a PDF and .bin otherwise', () => {
    expect(standardStoragePath(1, '1168', 'application/pdf')).toBe('1/1168.pdf');
    expect(standardStoragePath(2, '77', 'application/msword')).toBe('2/77.bin');
  });
});

describe('GET /api/documents/[id] PDF link at the standard path (SRS-211.1, #514)', () => {
  it('links the PDF at the standard path when the recorded path has no file (the #514 case)', async () => {
    db.row = SEEDED_ROW;
    storage.files.set('1/1168.pdf', '%PDF-1.4 minutes');

    const body = await openDocument();

    expect(storage.signCalls).toEqual(['civicclerk/salemma/1168.pdf', '1/1168.pdf']);
    // The link is on our own domain; the path stays on the server (#726).
    expect(body.document.pdf_url).toMatch(OWN_LINK);
    expect(body.document.pdf_url).not.toContain('1168.pdf');
    expect(console.error).not.toHaveBeenCalled();
  });

  it('uses the recorded path when it works, with no second Storage call', async () => {
    db.row = { ...SEEDED_ROW, storage_path: '1/1168.pdf' };
    storage.files.set('1/1168.pdf', '%PDF-1.4 minutes');

    const body = await openDocument();

    expect(storage.signCalls).toEqual(['1/1168.pdf']);
    expect(body.document.pdf_url).toMatch(OWN_LINK);
  });

  it('returns pdf_url null and logs once when neither path has the file', async () => {
    db.row = SEEDED_ROW;

    const body = await openDocument();

    expect(storage.signCalls).toEqual(['civicclerk/salemma/1168.pdf', '1/1168.pdf']);
    expect(body.document.pdf_url).toBeNull();
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith('Stored PDF link could not be created for document 15.');
  });

  it.each(['Pending', 'Complete', 'Failed'])('links the PDF for a %s document', async (status) => {
    db.row = {
      ...SEEDED_ROW,
      summary_status: status,
      summary_text: status === 'Complete' ? 'Summary.' : null,
      summary_generated_at: status === 'Complete' ? '2026-10-14T12:00:00+00:00' : null,
    };
    storage.files.set('1/1168.pdf', '%PDF-1.4 minutes');

    expect((await openDocument()).document.pdf_url).toMatch(OWN_LINK);
  });

  it('still gives a non-PDF document no link and makes no Storage call', async () => {
    db.row = { ...SEEDED_ROW, storage_path: 'demo/3.docx', mime_type: 'application/msword' };

    expect((await openDocument()).document.pdf_url).toBeNull();
    expect(storage.signCalls).toEqual([]);
  });
});

describe('readStoredPdf reads the standard path when the recorded one is missing (SRS-211.1, #514)', () => {
  it('reads the file at the fallback path', async () => {
    storage.files.set('1/1168.pdf', '%PDF-1.4 minutes');
    const supabase = getSupabaseClient()!;

    const result = await readStoredPdf(supabase, {
      storagePath: 'civicclerk/salemma/1168.pdf',
      mimeType: 'application/pdf',
      fallbackPath: '1/1168.pdf',
    });

    expect(result.ok).toBe(true);
    expect(storage.downloadCalls).toEqual(['civicclerk/salemma/1168.pdf', '1/1168.pdf']);
  });

  it('still reports missing when neither path has the file', async () => {
    const supabase = getSupabaseClient()!;

    const result = await readStoredPdf(supabase, {
      storagePath: 'civicclerk/salemma/1168.pdf',
      mimeType: 'application/pdf',
      fallbackPath: '1/1168.pdf',
    });

    expect(result).toEqual({ ok: false, reason: 'missing' });
  });

  it('makes one download when the fallback is the same path', async () => {
    storage.files.set('1/1168.pdf', '%PDF-1.4 minutes');
    const supabase = getSupabaseClient()!;

    await readStoredPdf(supabase, { storagePath: '1/1168.pdf', mimeType: 'application/pdf', fallbackPath: '1/1168.pdf' });

    expect(storage.downloadCalls).toEqual(['1/1168.pdf']);
  });
});

describe('Salem seed script stores paths where retrieval stores files (SRS-211.1, #514)', () => {
  it('seeds files 1169, 1164 and 1168 at <town_id>/<file id>.pdf, with no civicclerk/salemma paths', async () => {
    const { readFileSync } = await import('node:fs');
    const sql = readFileSync(new URL('../../supabase/seed_extraction_salem_documents.sql', import.meta.url), 'utf8');

    expect(sql).not.toContain("'civicclerk/salemma/");
    for (const fileId of ['1169', '1164', '1168']) {
      expect(sql).toContain(`v_town_id::text || '/${fileId}.pdf'`);
    }
  });
});
