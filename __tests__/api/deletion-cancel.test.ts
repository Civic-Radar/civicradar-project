// Tests for SRS-305.3, AO, Deletion cancel (bug #503):
// "The system shall keep the extraction unchanged when the user cancels the
//  deletion confirmation."
//
// Acceptance: Given the deletion confirmation is open, When the user cancels,
// Then the confirmation closes and the extraction is still in the list.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isDeletionCancelKey } from '../../lib/extractions';

const page = readFileSync(join(process.cwd(), 'app/(app)/extractions/page.tsx'), 'utf8').replace(/\r\n/g, '\n');

// The body of a function declared at the top of the page component.
function functionBody(name: string): string {
  const start = page.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  return page.slice(start, page.indexOf('\n  }\n', start));
}

// The markup of the button with the given test id.
function button(testId: string): string {
  const at = page.indexOf(`data-testid="${testId}"`);
  expect(at).toBeGreaterThan(-1);
  return page.slice(page.lastIndexOf('<button', at), page.indexOf('</button>', at));
}

describe('SRS-305.3: cancelling the deletion confirmation keeps the extraction', () => {
  it('cancelling closes the confirmation', () => {
    expect(functionBody('cancelDeletion')).toContain('setConfirmingId(null)');
  });

  it('cancelling sends nothing to the server', () => {
    const body = functionBody('cancelDeletion');
    expect(body).not.toContain('fetch(');
    expect(body).not.toContain('deleteExtraction');
  });

  it('cancelling does not change the list of saved extractions', () => {
    expect(functionBody('cancelDeletion')).not.toContain('setExtractions');
  });

  it('the Cancel button cancels, and does not delete', () => {
    const cancel = button('cancel-deletion');
    expect(cancel).toContain('onClick={cancelDeletion}');
    expect(cancel).not.toContain('deleteExtraction');
    expect(cancel).toContain('Cancel');
  });

  it('only the "Delete extraction" button deletes', () => {
    expect(page.match(/deleteExtraction\(e\.extraction_id\)/g)).toHaveLength(1);
    expect(page.match(/method: 'DELETE'/g)).toHaveLength(1);
    expect(functionBody('deleteExtraction')).toContain("method: 'DELETE'");
  });

  it('Cancel has the focus when the confirmation opens, so Enter keeps the extraction', () => {
    expect(button('cancel-deletion')).toContain('autoFocus');
    expect(page.match(/\bautoFocus\b/g)).toHaveLength(1);
  });

  it('the Escape key cancels', () => {
    expect(isDeletionCancelKey('Escape')).toBe(true);
    expect(page).toContain('if (isDeletionCancelKey(event.key) && !deleting) cancelDeletion();');
  });

  it.each(['Enter', ' ', 'Delete', 'Backspace', 'y'])('the %j key is not a cancel key', (key) => {
    expect(isDeletionCancelKey(key)).toBe(false);
  });
});

// The server side of the same rule: an extraction is deleted only by the DELETE
// request that confirming sends. Opening it after a cancel leaves it unchanged.
const deleted: number[] = [];
const ROW = {
  extraction_id: 5, user_id: 'user-a', document_id: 1, source_document_title: 'Agenda packet',
  status: 'Completed', failure_cause: null, requested_at: '2026-10-08T14:00:00Z', completed_at: '2026-10-08T14:01:00Z',
};

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-a' } }, error: null })) },
    from: (table: string) => {
      let op = 'select';
      const query: Record<string, unknown> = {
        select: () => query,
        update: () => { op = 'update'; return query; },
        delete: () => { op = 'delete'; return query; },
        eq: () => query,
        lt: () => query,
        order: () => query,
        maybeSingle: async () => ({ data: table === 'extractions' ? ROW : null, error: null }),
        then: (resolve: (v: unknown) => unknown) => {
          if (op === 'delete' && table === 'extractions') deleted.push(ROW.extraction_id);
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return query;
    },
  })),
}));

import { DELETE, GET } from '../../app/api/extractions/[id]/route';

const call = (handler: typeof GET, method: string) =>
  handler(new Request('http://localhost/api/extractions/5', { method, headers: { authorization: 'Bearer t' } }), { params: { id: '5' } });

describe('SRS-305.3: an extraction is deleted only by a confirmed deletion', () => {
  beforeEach(() => { deleted.length = 0; });

  it('opening the extraction after cancelling returns it unchanged and deletes nothing', async () => {
    const response = await call(GET, 'GET');
    expect(response.status).toBe(200);
    expect((await response.json()).extraction).toMatchObject({ extraction_id: 5, source_document_title: 'Agenda packet', status: 'Completed' });
    expect(deleted).toEqual([]);
  });

  it('only the DELETE request, sent on confirming, deletes it', async () => {
    const response = await call(DELETE, 'DELETE');
    expect(response.status).toBe(200);
    expect(deleted).toEqual([5]);
  });
});
