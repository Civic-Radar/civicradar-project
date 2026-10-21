import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassifyResult } from '../../lib/meetingTagging';

const client = vi.hoisted(() => ({ kind: 'service-role client' }));

vi.mock('../../lib/supabase', () => ({
  getSupabaseClient: vi.fn(() => client),
}));

vi.mock('../../lib/meetingTagging', () => ({
  classifyMeetingTopics: vi.fn(),
}));

import { POST } from '../../app/api/topic-tagging/route';
import { classifyMeetingTopics } from '../../lib/meetingTagging';
import { getSupabaseClient } from '../../lib/supabase';

const HOUSING_SENTENCE =
  'Order to appropriate $250,000 from the Affordable Housing Trust Fund to create 12 affordable housing units at 40 Lafayette Street.';

function run(body: unknown) {
  return POST(
    new Request('http://localhost/api/topic-tagging', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

function classifyReturns(result: ClassifyResult) {
  vi.mocked(classifyMeetingTopics).mockResolvedValueOnce(result);
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  vi.mocked(getSupabaseClient).mockClear();
  vi.mocked(classifyMeetingTopics).mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/topic-tagging (SRS-401.4)', () => {
  it('tags the meeting with the service-role client and returns the tags', async () => {
    classifyReturns({
      status: 'classified',
      tags: [{ topic_id: 1, topic_name: 'Housing', agenda_item_id: 2, evidence_text: HOUSING_SENTENCE }],
    });

    const response = await run({ meetingId: 1 });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      meeting_id: 1,
      result: 'classified',
      tags: [{ topic_id: 1, topic_name: 'Housing', evidence_text: HOUSING_SENTENCE }],
    });
    expect(classifyMeetingTopics).toHaveBeenCalledWith(client, 1);
  });

  it('reports a meeting whose agenda text matches no topic', async () => {
    classifyReturns({ status: 'classified', tags: [] });

    const response = await run({ meetingId: 1 });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ meeting_id: 1, result: 'classified', tags: [] });
  });

  it('reports a meeting with no agenda text', async () => {
    classifyReturns({ status: 'no_agenda_text' });

    const response = await run({ meetingId: 7 });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ meeting_id: 7, result: 'no_agenda_text', tags: [] });
  });

  it.each([
    [{ status: 'meeting_not_found' } as ClassifyResult, 404, 'Meeting not found.'],
    [{ status: 'agenda_changed' } as ClassifyResult, 409, 'The agenda changed while tagging. Run tagging again.'],
    [{ status: 'error' } as ClassifyResult, 500, 'Topic tagging could not be completed. Please try again.'],
  ])('maps %o to %i', async (result, status, error) => {
    classifyReturns(result);

    const response = await run({ meetingId: 1 });

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
  });

  it.each([
    ['a body that is not JSON', 'not json'],
    ['a missing meetingId', {}],
    ['a string id', { meetingId: '1' }],
    ['zero', { meetingId: 0 }],
    ['a negative id', { meetingId: -3 }],
    ['a fraction', { meetingId: 1.5 }],
    ['an id past the safe integer limit', { meetingId: 9007199254740993 }],
  ])('returns 400 for %s before creating a client', async (_label, body) => {
    const response = await run(body);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'meetingId must be a positive whole number.' });
    expect(getSupabaseClient).not.toHaveBeenCalled();
    expect(classifyMeetingTopics).not.toHaveBeenCalled();
  });

  it('reports a configuration error without the service-role key', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');

    const response = await run({ meetingId: 1 });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Supabase credentials are not configured.' });
    expect(getSupabaseClient).not.toHaveBeenCalled();
    expect(classifyMeetingTopics).not.toHaveBeenCalled();
  });

  it('reports a configuration error when Supabase is not configured', async () => {
    vi.mocked(getSupabaseClient).mockReturnValueOnce(null);

    const response = await run({ meetingId: 1 });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Supabase credentials are not configured.' });
    expect(classifyMeetingTopics).not.toHaveBeenCalled();
  });
});
