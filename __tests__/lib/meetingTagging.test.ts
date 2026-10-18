import { beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyMeetingTopics } from '../../lib/meetingTagging';
import type { SupabaseClient } from '../../lib/residentAuth';

type Result = { data?: unknown; error: { message: string } | null };
type Call = { table: string; method: string; args: unknown[] };

// Each from(table) call returns a chain that records its calls and resolves
// with the result registered for "<table>.<first method>", e.g. "topics.select".
// rpc(name, args) is recorded as table "rpc" and resolves "rpc.<name>".
let results: Record<string, Result> = {};
const calls: Call[] = [];

function chain(table: string) {
  let operation = '';
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is', 'order', 'maybeSingle']) {
    builder[method] = (...args: unknown[]) => {
      if (!operation) operation = method;
      calls.push({ table, method, args });
      return builder;
    };
  }
  builder.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(results[`${table}.${operation}`] ?? { data: null, error: null }).then(resolve, reject);
  return builder;
}

const supabase = {
  from: vi.fn((table: string) => chain(table)),
  rpc: vi.fn(async (name: string, args: unknown) => {
    calls.push({ table: 'rpc', method: name, args: [args] });
    return results[`rpc.${name}`] ?? { data: true, error: null };
  }),
} as unknown as SupabaseClient;

// The eight starter topics from supabase/seed_topics.sql.
const CATALOG = [
  { topic_id: 1, name: 'Housing' },
  { topic_id: 2, name: 'Transportation & Parking' },
  { topic_id: 3, name: 'School Budget' },
  { topic_id: 4, name: 'Zoning & Land Use' },
  { topic_id: 5, name: 'Public Safety' },
  { topic_id: 6, name: 'Parks & Recreation' },
  { topic_id: 7, name: 'Taxes & Municipal Budget' },
  { topic_id: 8, name: 'Environment' },
];

const HOUSING_SENTENCE =
  'Order to appropriate $250,000 from the Affordable Housing Trust Fund to create 12 affordable housing units at 40 Lafayette Street.';

// The demo agenda items from supabase/seed_topic_tagging_demo.sql.
const DEMO_ITEMS = [
  { agenda_item_id: 1, item_text: 'Call to order and roll call of members present.' },
  { agenda_item_id: 2, item_text: HOUSING_SENTENCE },
  { agenda_item_id: 3, item_text: 'Approval of the minutes of the August 24, 2026 regular meeting.' },
];

const dbError = { message: 'relation "meeting_topics" does not exist (42P01)' };

function callsTo(table: string) {
  return calls.filter((call) => call.table === table);
}

function saves() {
  return calls.filter((call) => call.table === 'rpc');
}

beforeEach(() => {
  calls.length = 0;
  results = {
    'meetings.select': { data: { meeting_id: 1 }, error: null },
    'agenda_items.select': { data: DEMO_ITEMS, error: null },
    'topics.select': { data: CATALOG, error: null },
  };
});

describe('Save topic tags (SRS-401.4)', () => {
  it('saves the Housing tag for the demo meeting and marks it Classified', async () => {
    const result = await classifyMeetingTopics(supabase, 1);

    expect(result).toEqual({
      status: 'classified',
      tags: [{ topic_id: 1, topic_name: 'Housing', agenda_item_id: 2, evidence_text: HOUSING_SENTENCE }],
    });
    expect(saves()).toEqual([
      {
        table: 'rpc',
        method: 'replace_meeting_topics',
        args: [{ p_meeting_id: 1, p_tags: [{ topic_id: 1, evidence_text: HOUSING_SENTENCE }], p_agenda: DEMO_ITEMS }],
      },
    ]);
  });

  it('marks the meeting Classified with no tags when its agenda text matches no topic', async () => {
    results['agenda_items.select'] = {
      data: [{ agenda_item_id: 1, item_text: 'Approval of the minutes.' }],
      error: null,
    };

    const result = await classifyMeetingTopics(supabase, 1);

    expect(result).toEqual({ status: 'classified', tags: [] });
    expect(saves()[0].args).toEqual([
      { p_meeting_id: 1, p_tags: [], p_agenda: [{ agenda_item_id: 1, item_text: 'Approval of the minutes.' }] },
    ]);
  });

  it.each([
    ['no agenda items', []],
    ['only blank agenda text', [{ agenda_item_id: 1, item_text: '   ' }, { agenda_item_id: 2, item_text: null }]],
  ])('saves nothing when the meeting has %s', async (_label, items) => {
    results['agenda_items.select'] = { data: items, error: null };

    const result = await classifyMeetingTopics(supabase, 1);

    expect(result).toEqual({ status: 'no_agenda_text' });
    expect(callsTo('topics')).toEqual([]);
    expect(saves()).toEqual([]);
  });

  it("reads only the meeting's agenda items that are not removed, in agenda order", async () => {
    await classifyMeetingTopics(supabase, 1);

    expect(callsTo('agenda_items').map(({ method, args }) => [method, args])).toEqual([
      ['select', ['agenda_item_id, item_text']],
      ['eq', ['meeting_id', 1]],
      ['is', ['removed_at', null]],
      ['order', ['sort_order']],
      ['order', ['agenda_item_id']],
    ]);
    expect(callsTo('topics').map(({ method, args }) => [method, args])).toEqual([
      ['select', ['topic_id, name']],
      ['is', ['removed_at', null]],
      ['order', ['topic_id']],
    ]);
  });

  it('stops when the meeting does not exist', async () => {
    results['meetings.select'] = { data: null, error: null };

    const result = await classifyMeetingTopics(supabase, 999);

    expect(result).toEqual({ status: 'meeting_not_found' });
    expect(callsTo('agenda_items')).toEqual([]);
    expect(saves()).toEqual([]);
  });

  it.each(['meetings.select', 'agenda_items.select', 'topics.select'])(
    'returns an error and saves nothing when %s fails',
    async (key) => {
      results[key] = { data: null, error: dbError };

      const result = await classifyMeetingTopics(supabase, 1);

      expect(result).toEqual({ status: 'error' });
      expect(saves()).toEqual([]);
    },
  );

  it('sends the agenda exactly as read, including blank and empty text', async () => {
    const items = [
      { agenda_item_id: 4, item_text: null },
      { agenda_item_id: 5, item_text: '  ' },
      { agenda_item_id: 6, item_text: 'Housing update.' },
    ];
    results['agenda_items.select'] = { data: items, error: null };

    await classifyMeetingTopics(supabase, 1);

    expect(saves()[0].args).toEqual([
      { p_meeting_id: 1, p_tags: [{ topic_id: 1, evidence_text: 'Housing update.' }], p_agenda: items },
    ]);
  });

  it('reports that the agenda changed when the save is refused', async () => {
    results['rpc.replace_meeting_topics'] = { data: false, error: null };

    const result = await classifyMeetingTopics(supabase, 1);

    expect(result).toEqual({ status: 'agenda_changed' });
  });

  it('returns an error when the save gives an unexpected answer', async () => {
    results['rpc.replace_meeting_topics'] = { data: null, error: null };

    const result = await classifyMeetingTopics(supabase, 1);

    expect(result).toEqual({ status: 'error' });
  });

  it('returns an error, without the database text, when saving fails', async () => {
    results['rpc.replace_meeting_topics'] = { data: null, error: dbError };

    const result = await classifyMeetingTopics(supabase, 1);

    expect(result).toEqual({ status: 'error' });
  });
});
