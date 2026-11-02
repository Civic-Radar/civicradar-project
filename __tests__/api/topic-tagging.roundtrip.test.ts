import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MeetingRow = { meeting_id: number; topic_classification: string };
type AgendaRow = { agenda_item_id: number; meeting_id: number; sort_order: number; item_text: string | null; removed_at: string | null };
type TopicRow = { topic_id: number; name: string; removed_at: string | null };
type TagRow = { meeting_id: number; topic_id: number; evidence_text: string };

// An in-memory stand-in for the tables topic tagging uses and for the
// replace_meeting_topics and mark_meeting_unavailable functions, so tags saved
// by one request are visible to the next. It models only the calls the code
// makes today and throws on anything else.
const store = vi.hoisted(() => ({
  meetings: [] as MeetingRow[],
  agendaItems: [] as AgendaRow[],
  topics: [] as TopicRow[],
  tags: [] as TagRow[],
  // Runs once at the start of the next save, to change the agenda mid-run.
  beforeSave: null as null | (() => void),
}));

vi.mock('../../lib/supabase', () => {
  type Query = {
    operation: string;
    columns: string;
    filters: { kind: string; args: unknown[] }[];
    orders: string[];
    single: boolean;
  };

  function unsupported(table: string, query: Query): never {
    throw new Error(`The stand-in does not model this call: ${table} ${JSON.stringify(query)}`);
  }

  function filterValue(query: Query, kind: string, column: string) {
    const filter = query.filters.find((f) => f.kind === kind && f.args[0] === column);
    return filter ? filter.args[1] : undefined;
  }

  function currentAgenda(meetingId: number) {
    return store.agendaItems
      .filter((item) => item.meeting_id === meetingId && item.removed_at === null)
      .sort((a, b) => a.sort_order - b.sort_order || a.agenda_item_id - b.agenda_item_id)
      .map(({ agenda_item_id, item_text }) => ({ agenda_item_id, item_text }));
  }

  function run(table: string, query: Query) {
    const shape = `${table}.${query.operation}(${query.filters.map((f) => `${f.kind}:${f.args[0]}`).join(',')})`;

    if (shape === 'meetings.select(eq:meeting_id)' && query.columns === 'meeting_id' && query.single) {
      const row = store.meetings.find((meeting) => meeting.meeting_id === filterValue(query, 'eq', 'meeting_id'));
      return { data: row ? { meeting_id: row.meeting_id } : null, error: null };
    }

    if (
      shape === 'agenda_items.select(eq:meeting_id,is:removed_at)' &&
      query.columns === 'agenda_item_id, item_text' &&
      filterValue(query, 'is', 'removed_at') === null &&
      JSON.stringify(query.orders) === JSON.stringify(['sort_order', 'agenda_item_id'])
    ) {
      return { data: currentAgenda(filterValue(query, 'eq', 'meeting_id') as number), error: null };
    }

    if (
      shape === 'topics.select(is:removed_at)' &&
      query.columns === 'topic_id, name' &&
      filterValue(query, 'is', 'removed_at') === null &&
      JSON.stringify(query.orders) === JSON.stringify(['topic_id'])
    ) {
      const rows = store.topics
        .filter((topic) => topic.removed_at === null)
        .sort((a, b) => a.topic_id - b.topic_id)
        .map(({ topic_id, name }) => ({ topic_id, name }));
      return { data: rows, error: null };
    }

    return unsupported(table, query);
  }

  // Same outcome as public.mark_meeting_unavailable in supabase/schema.sql.
  function markUnavailable(meetingId: number, agenda: unknown) {
    const meeting = store.meetings.find((row) => row.meeting_id === meetingId);
    if (!meeting) return { data: null, error: { message: `Meeting ${meetingId} not found` } };

    if (JSON.stringify(currentAgenda(meetingId)) !== JSON.stringify(agenda)) {
      return { data: false, error: null };
    }

    store.tags = store.tags.filter((row) => row.meeting_id !== meetingId);
    meeting.topic_classification = 'Unavailable';
    return { data: true, error: null };
  }

  // Same outcome as public.replace_meeting_topics in supabase/schema.sql.
  function rpc(name: string, args: { p_meeting_id: number; p_tags: unknown; p_agenda: unknown }) {
    if (name !== 'replace_meeting_topics' && name !== 'mark_meeting_unavailable') {
      throw new Error(`The stand-in does not model rpc ${name}`);
    }
    const hook = store.beforeSave;
    store.beforeSave = null;
    hook?.();

    if (name === 'mark_meeting_unavailable') {
      return Promise.resolve(markUnavailable(args.p_meeting_id, args.p_agenda));
    }

    const { p_meeting_id: meetingId, p_tags: tags, p_agenda: agenda } = args;
    if (!Array.isArray(tags)) return Promise.resolve({ data: null, error: { message: 'p_tags must be a JSON array' } });
    const meeting = store.meetings.find((row) => row.meeting_id === meetingId);
    if (!meeting) return Promise.resolve({ data: null, error: { message: `Meeting ${meetingId} not found` } });

    if (JSON.stringify(currentAgenda(meetingId)) !== JSON.stringify(agenda)) {
      return Promise.resolve({ data: false, error: null });
    }

    store.tags = [
      ...store.tags.filter((row) => row.meeting_id !== meetingId),
      ...(tags as { topic_id: number; evidence_text: string }[]).map(({ topic_id, evidence_text }) => ({
        meeting_id: meetingId,
        topic_id,
        evidence_text,
      })),
    ];
    meeting.topic_classification = 'Classified';
    return Promise.resolve({ data: true, error: null });
  }

  function from(table: string) {
    const query: Query = { operation: '', columns: '', filters: [], orders: [], single: false };
    const builder = {
      select(columns: string) { query.operation = 'select'; query.columns = columns; return builder; },
      eq(...args: unknown[]) { query.filters.push({ kind: 'eq', args }); return builder; },
      is(...args: unknown[]) { query.filters.push({ kind: 'is', args }); return builder; },
      order(column: string) { query.orders.push(column); return builder; },
      maybeSingle() { query.single = true; return builder; },
      then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        return Promise.resolve().then(() => run(table, query)).then(resolve, reject);
      },
    };
    return builder;
  }

  return { getSupabaseClient: vi.fn(() => ({ from, rpc })) };
});

import { POST } from '../../app/api/topic-tagging/route';

const HOUSING_SENTENCE =
  'Order to appropriate $250,000 from the Affordable Housing Trust Fund to create 12 affordable housing units at 40 Lafayette Street.';

function tag(meetingId: number) {
  return POST(
    new Request('http://localhost/api/topic-tagging', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-topic-tagging-secret': 'test-topic-tagging-secret' },
      body: JSON.stringify({ meetingId }),
    }),
  );
}

function classification(meetingId: number) {
  return store.meetings.find((meeting) => meeting.meeting_id === meetingId)?.topic_classification;
}

function tagsFor(meetingId: number) {
  return store.tags.filter((row) => row.meeting_id === meetingId);
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
  vi.stubEnv('TOPIC_TAGGING_SECRET', 'test-topic-tagging-secret');
  // The eight starter topics from supabase/seed_topics.sql.
  store.topics = [
    'Housing',
    'Transportation & Parking',
    'School Budget',
    'Zoning & Land Use',
    'Public Safety',
    'Parks & Recreation',
    'Taxes & Municipal Budget',
    'Environment',
  ].map((name, index) => ({ topic_id: index + 1, name, removed_at: null }));
  store.meetings = [
    { meeting_id: 1, topic_classification: 'Pending' }, // the Salem demo meeting
    { meeting_id: 2, topic_classification: 'Pending' },
    { meeting_id: 3, topic_classification: 'Pending' }, // a generic title and no agenda items
  ];
  // Meeting 1's items match supabase/seed_topic_tagging_demo.sql; only item 2 discusses housing.
  store.agendaItems = [
    { agenda_item_id: 1, meeting_id: 1, sort_order: 0, item_text: 'Call to order and roll call of members present.', removed_at: null },
    { agenda_item_id: 2, meeting_id: 1, sort_order: 1, item_text: HOUSING_SENTENCE, removed_at: null },
    { agenda_item_id: 3, meeting_id: 1, sort_order: 2, item_text: 'Approval of the minutes of the August 24, 2026 regular meeting.', removed_at: null },
    { agenda_item_id: 4, meeting_id: 2, sort_order: 0, item_text: 'Approval of the warrant.', removed_at: null },
  ];
  store.tags = [];
  store.beforeSave = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Topic tagging round trip (SRS-401.4)', () => {
  it("gives the parent meeting the Housing tag when one of its agenda items discusses housing", async () => {
    const response = await tag(1);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      meeting_id: 1,
      result: 'classified',
      tags: [{ topic_id: 1, topic_name: 'Housing', evidence_text: HOUSING_SENTENCE }],
    });
    expect(store.tags).toEqual([{ meeting_id: 1, topic_id: 1, evidence_text: HOUSING_SENTENCE }]);
    expect(classification(1)).toBe('Classified');
  });

  it('adds no duplicate when tagging runs again', async () => {
    const first = await (await tag(1)).json();

    const second = await tag(1);

    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(first);
    expect(store.tags).toEqual([{ meeting_id: 1, topic_id: 1, evidence_text: HOUSING_SENTENCE }]);
  });

  it('removes the tag when the agenda text no longer discusses housing', async () => {
    await tag(1);
    store.agendaItems[1].item_text = 'Order to appropriate $250,000 for road resurfacing on Lafayette Street.';

    const response = await tag(1);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ meeting_id: 1, result: 'classified', tags: [] });
    expect(tagsFor(1)).toEqual([]);
    expect(classification(1)).toBe('Classified');
  });

  it('tags only the parent meeting', async () => {
    await tag(1);

    expect(tagsFor(2)).toEqual([]);
    expect(classification(2)).toBe('Pending');
  });

  it('saves nothing when the agenda changes during a run, and the next run uses the new text', async () => {
    store.beforeSave = () => {
      store.agendaItems[0].item_text = 'Call to order. Public hearing on the Bridge Street parking plan.';
    };

    const interrupted = await tag(1);

    expect(interrupted.status).toBe(409);
    expect(await interrupted.json()).toEqual({ error: 'The agenda changed while tagging. Run tagging again.' });
    expect(store.tags).toEqual([]);
    expect(classification(1)).toBe('Pending');

    const retry = await tag(1);

    expect(retry.status).toBe(200);
    expect((await retry.json()).tags.map((t: { topic_name: string }) => t.topic_name)).toEqual([
      'Housing',
      'Transportation & Parking',
    ]);
    expect(tagsFor(1)).toEqual([
      { meeting_id: 1, topic_id: 1, evidence_text: HOUSING_SENTENCE },
      { meeting_id: 1, topic_id: 2, evidence_text: 'Public hearing on the Bridge Street parking plan.' },
    ]);
  });
});

describe('Unavailable classification round trip (SRS-401.10)', () => {
  it('marks a meeting with a generic title and no agenda text Unavailable, not a confirmed non-match', async () => {
    const response = await tag(3);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ meeting_id: 3, result: 'no_agenda_text', tags: [] });
    expect(classification(3)).toBe('Unavailable');
    expect(tagsFor(3)).toEqual([]);
  });

  it('removes the tags of a meeting whose agenda text goes away, and no other meeting changes', async () => {
    await tag(1);
    await tag(2);
    store.agendaItems = store.agendaItems.map((item) => (item.meeting_id === 1 ? { ...item, item_text: null } : item));

    const response = await tag(1);

    expect(await response.json()).toEqual({ meeting_id: 1, result: 'no_agenda_text', tags: [] });
    expect(classification(1)).toBe('Unavailable');
    expect(tagsFor(1)).toEqual([]);
    expect(classification(2)).toBe('Classified');
  });

  it('saves nothing when agenda text arrives during a run, and the next run classifies it', async () => {
    store.beforeSave = () => {
      store.agendaItems.push({ agenda_item_id: 5, meeting_id: 3, sort_order: 0, item_text: HOUSING_SENTENCE, removed_at: null });
    };

    const interrupted = await tag(3);

    expect(interrupted.status).toBe(409);
    expect(classification(3)).toBe('Pending');

    const retry = await tag(3);

    expect(retry.status).toBe(200);
    expect(classification(3)).toBe('Classified');
    expect(tagsFor(3)).toEqual([{ meeting_id: 3, topic_id: 1, evidence_text: HOUSING_SENTENCE }]);
  });

  it('classifies an Unavailable meeting once agenda text arrives', async () => {
    await tag(3);
    store.agendaItems.push({ agenda_item_id: 5, meeting_id: 3, sort_order: 0, item_text: HOUSING_SENTENCE, removed_at: null });

    const response = await tag(3);

    expect(response.status).toBe(200);
    expect(classification(3)).toBe('Classified');
    expect(tagsFor(3)).toEqual([{ meeting_id: 3, topic_id: 1, evidence_text: HOUSING_SENTENCE }]);
  });
});
