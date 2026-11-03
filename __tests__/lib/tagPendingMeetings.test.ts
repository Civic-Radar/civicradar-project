import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/meetingTagging', () => ({
  classifyMeetingTopics: vi.fn(),
}));

import { classifyMeetingTopics, type ClassifyResult } from '../../lib/meetingTagging';
import { tagPendingMeetings } from '../../lib/tagPendingMeetings';

const NOW = new Date('2026-11-02T20:00:00.000Z');
const now = () => NOW;

type Result = { data: { meeting_id: number }[] | null; error: { message: string } | null };
type Query = { table: string; calls: [string, ...unknown[]][] };

// A meetings query records every builder call. The upcoming read (gte) and the
// older read (or) each resolve with their own result.
function fakeSupabase(upcoming: Result, older: Result = { data: [], error: null }) {
  const queries: Query[] = [];
  const client = {
    from(table: string) {
      const query: Query = { table, calls: [] };
      queries.push(query);
      const builder: Record<string, unknown> = {};
      for (const name of ['select', 'eq', 'gte', 'or', 'order', 'limit']) {
        builder[name] = (...args: unknown[]) => {
          query.calls.push([name, ...args]);
          return builder;
        };
      }
      builder.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(query.calls.some(([name]) => name === 'gte') ? upcoming : older).then(resolve, reject);
      return builder;
    },
  };
  return { client: client as never, queries };
}

const rows = (...ids: number[]) => ({ data: ids.map((meeting_id) => ({ meeting_id })), error: null });
const tagged = () => vi.mocked(classifyMeetingTopics).mock.calls.map(([, id]) => id);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(classifyMeetingTopics).mockResolvedValue({ status: 'classified', tags: [] });
});

describe('tagPendingMeetings (Task 401.4-7)', () => {
  it('reads only Pending meetings, upcoming ones soonest first, then the rest newest first', async () => {
    const fake = fakeSupabase(rows(5, 6), rows(2));

    await tagPendingMeetings(fake.client, { now });

    expect(fake.queries.map((q) => q.table)).toEqual(['meetings', 'meetings']);
    const [upcoming, older] = fake.queries.map((q) => q.calls);
    expect(upcoming).toEqual([
      ['select', 'meeting_id'],
      ['eq', 'topic_classification', 'Pending'],
      ['gte', 'start_at', NOW.toISOString()],
      ['order', 'start_at', { ascending: true }],
      ['order', 'meeting_id', { ascending: true }],
      ['limit', 200],
    ]);
    expect(older).toEqual([
      ['select', 'meeting_id'],
      ['eq', 'topic_classification', 'Pending'],
      ['or', `start_at.is.null,start_at.lt.${NOW.toISOString()}`],
      ['order', 'start_at', { ascending: false, nullsFirst: false }],
      ['order', 'meeting_id', { ascending: true }],
      ['limit', 198],
    ]);
    expect(tagged()).toEqual([5, 6, 2]);
  });

  it('passes the client it was given to the tagger', async () => {
    const fake = fakeSupabase(rows(5));

    await tagPendingMeetings(fake.client, { now });

    expect(vi.mocked(classifyMeetingTopics).mock.calls[0][0]).toBe(fake.client);
  });

  it('counts each result', async () => {
    const fake = fakeSupabase(rows(1, 2, 3, 4, 5, 6));
    const results: Record<number, ClassifyResult> = {
      1: { status: 'classified', tags: [] },
      2: { status: 'classified', tags: [] },
      3: { status: 'no_agenda_text' },
      4: { status: 'agenda_changed' },
      5: { status: 'error' },
      6: { status: 'meeting_not_found' },
    };
    vi.mocked(classifyMeetingTopics).mockImplementation(async (_client, id) => results[id]);

    const counts = await tagPendingMeetings(fake.client, { now });

    expect(counts).toEqual({ classified: 2, unavailable: 1, agendaChanged: 1, failed: 2 });
    expect(vi.mocked(console.error).mock.calls.map(([line]) => line)).toEqual([
      'Topic tagging: meeting 5 was not tagged (error)',
      'Topic tagging: meeting 6 was not tagged (meeting_not_found)',
    ]);
    expect(console.log).toHaveBeenCalledWith(
      'Topic tagging: 6 meetings, classified 2, unavailable 1, agenda changed 1, failed 2',
    );
  });

  it('keeps going when tagging one meeting throws', async () => {
    const fake = fakeSupabase(rows(1, 2, 3));
    vi.mocked(classifyMeetingTopics).mockImplementation(async (_client, id) => {
      if (id === 2) throw new Error('network down');
      return { status: 'classified', tags: [] };
    });

    const counts = await tagPendingMeetings(fake.client, { now });

    expect(tagged()).toEqual([1, 2, 3]);
    expect(counts).toEqual({ classified: 2, unavailable: 0, agendaChanged: 0, failed: 1 });
  });

  it('tags at most the limit, and skips the second read when upcoming meetings fill it', async () => {
    const fake = fakeSupabase(rows(1, 2, 3));

    await tagPendingMeetings(fake.client, { now, limit: 3 });

    expect(fake.queries).toHaveLength(1);
    expect(tagged()).toEqual([1, 2, 3]);
  });

  it('tags nothing when no meeting is Pending', async () => {
    const fake = fakeSupabase(rows(), rows());

    const counts = await tagPendingMeetings(fake.client, { now });

    expect(classifyMeetingTopics).not.toHaveBeenCalled();
    expect(counts).toEqual({ classified: 0, unavailable: 0, agendaChanged: 0, failed: 0 });
  });

  it('returns null and tags nothing when the upcoming read fails', async () => {
    const fake = fakeSupabase({ data: null, error: { message: 'relation missing' } });

    expect(await tagPendingMeetings(fake.client, { now })).toBeNull();
    expect(classifyMeetingTopics).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith('Topic tagging: the Pending meetings could not be read');
  });

  it('returns null and tags nothing when the older read fails', async () => {
    const fake = fakeSupabase(rows(5), { data: null, error: { message: 'timeout' } });

    expect(await tagPendingMeetings(fake.client, { now })).toBeNull();
    expect(classifyMeetingTopics).not.toHaveBeenCalled();
  });
});
