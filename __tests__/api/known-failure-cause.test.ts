// Tests for SRS-307.2, AO, Known failure cause.
// "The system shall display the cause of failure when a failed extraction's cause
//  is an unreadable file, a file over the size limit, or a missing source file."
//
// Acceptance: Given an extraction failed because the file could not be read, When
// the failure message is displayed, Then it states that the file could not be read.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FAILURE_CAUSE_MESSAGES, failureCauseMessage } from '../../lib/extractions';

const OWNER = { id: 'user-a', email: 'a@example.com' };
type Row = Record<string, unknown>;
let rows: Row[] = [];

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: OWNER }, error: null })) },
    from: vi.fn(() => {
      const filters: [string, unknown][] = [];
      const matching = () => rows.filter((r) => filters.every(([c, v]) => r[c] === v));
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn((c: string, v: unknown) => { filters.push([c, v]); return query; }),
        order: vi.fn(async () => ({ data: [], error: null })),
        maybeSingle: vi.fn(async () => ({ data: matching()[0] ?? null, error: null })),
      };
      return query;
    }),
  })),
}));

import { GET } from '../../app/api/extractions/[id]/route';

async function open(status: string, failureCause: string | null) {
  rows = [{
    extraction_id: 26, user_id: OWNER.id, document_id: 25, source_document_title: 'Salem City Council Regular Meeting September 10, 2026',
    status, failure_cause: failureCause, requested_at: '2026-10-22T05:42:36Z', completed_at: '2026-10-22T05:42:37Z',
  }];
  const response = await GET(new Request('http://localhost/api/extractions/26', { headers: { authorization: 'Bearer t' } }), { params: { id: '26' } });
  return (await response.json()).extraction;
}

beforeEach(() => { rows = []; });

describe('Known failure cause (SRS-307.2)', () => {
  it('states that the file could not be read when the extraction failed on an unreadable file', async () => {
    const extraction = await open('Failed', 'Unreadable file');

    expect(extraction.failure_message).toBe('The file could not be read.');
    expect(extraction.failure_message).toMatch(/could not be read/);
  });

  it('states that the file is over the size limit', async () => {
    expect((await open('Failed', 'File too large')).failure_message).toBe('The file is larger than the 25 MB size limit.');
  });

  it('states that the source file is missing', async () => {
    expect((await open('Failed', 'Missing source file')).failure_message).toBe('The source file could not be found.');
  });

  it('gives no cause for a failure that is not one of the known causes (SRS-307.3)', async () => {
    expect((await open('Failed', 'Other')).failure_message).toBeNull();
  });

  it('gives no cause for an extraction that did not fail', async () => {
    expect((await open('Completed', null)).failure_message).toBeNull();
  });

  it('uses plain words only: no error codes or technical details', () => {
    for (const message of Object.values(FAILURE_CAUSE_MESSAGES)) {
      expect(message).not.toMatch(/\b\d{3}\b|error|exception|stack|undefined|null/i);
    }
    expect(failureCauseMessage(null)).toBeNull();
    expect(failureCauseMessage('something unexpected')).toBeNull();
  });
});
