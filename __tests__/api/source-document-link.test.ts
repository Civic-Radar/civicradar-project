// Tests for SRS-303.2, AO, Source document link.
// "The system shall open the source document's detail page (SRS-203.1) when the
//  user selects the source link on an extraction result."
//
// Acceptance: Given an extraction result for document X is open, When the user
// selects the source link, Then document X's detail page opens.
//
// The source link goes to sourceDocumentHref(extraction). These tests follow it
// end to end: extraction result -> link -> the detail page's data for document X.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sourceDocumentHref } from '../../lib/extractions';

const OWNER = { id: 'user-a', email: 'a@example.com' };

type Row = Record<string, unknown>;
let tables: Record<string, Row[]> = {};

// In-memory stand-in for the tables the extraction and document routes read.
function from(table: string) {
  const filters: [string, unknown][] = [];
  const matching = () => (tables[table] ?? []).filter((row) => filters.every(([c, v]) => row[c] === v));
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
    order: async () => ({ data: matching(), error: null }),
    maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
  };
  return query;
}

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async (token: string) =>
        token === 'token-a'
          ? { data: { user: OWNER }, error: null }
          : { data: { user: null }, error: { message: 'Invalid token' } },
      ),
    },
    from,
  })),
}));

import { GET as getExtraction } from '../../app/api/extractions/[id]/route';
import { GET as getDocument } from '../../app/api/documents/[id]/route';

function openExtraction(id: string) {
  const request = new Request(`http://localhost/api/extractions/${id}`, { headers: { authorization: 'Bearer token-a' } });
  return getExtraction(request, { params: { id } });
}

// What the document detail page (SRS-203.1) loads for the address /documents/<id>.
function openDocumentPage(href: string) {
  const id = href.replace('/documents/', '');
  const request = new Request(`http://localhost/api/documents/${id}`, { headers: { authorization: 'Bearer token-a' } });
  return getDocument(request, { params: { id } });
}

const DOCUMENT_X = {
  document_id: 13, meeting_id: 7, town_id: 1, document_type: 'Agenda',
  title: 'Joint Public Hearing with the Planning Board Monday October 19, 2026',
  source_url: 'https://salemma.portal.civicclerk.com/event/1193/overview',
  retrieved_at: '2026-10-15T00:36:00Z',
};
const OTHER_DOCUMENT = { ...DOCUMENT_X, document_id: 14, title: 'Salem City Council Regular Meeting September 10, 2026' };

function extraction(documentId: number | null): Row {
  return {
    extraction_id: 25, user_id: OWNER.id, document_id: documentId,
    source_document_title: DOCUMENT_X.title, status: 'Completed', failure_cause: null,
    requested_at: '2026-10-21T21:32:00Z', completed_at: '2026-10-21T21:32:30Z',
  };
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  tables = { extractions: [extraction(13)], extracted_officials: [], documents: [DOCUMENT_X, OTHER_DOCUMENT] };
});

describe('Source document link (SRS-303.2)', () => {
  it("links an extraction result for document X to document X's detail page", () => {
    expect(sourceDocumentHref({ document_id: 13 })).toBe('/documents/13');
  });

  it('opens document X, and not another document, when the source link is selected', async () => {
    const result = await (await openExtraction('25')).json();
    const href = sourceDocumentHref(result.extraction);

    const response = await openDocumentPage(href!);
    const body = await response.json();

    expect(href).toBe('/documents/13');
    expect(response.status).toBe(200);
    expect(body.document.document_id).toBe(13);
    expect(body.document.title).toBe(DOCUMENT_X.title);
  });

  it('has no source link when the extraction no longer has a source document', async () => {
    tables.extractions = [extraction(null)];

    const result = await (await openExtraction('25')).json();

    expect(result.extraction.source_document_title).toBe(DOCUMENT_X.title);
    expect(sourceDocumentHref(result.extraction)).toBeNull();
  });
});
