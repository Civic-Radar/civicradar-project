import { describe, expect, it } from 'vitest';
import { EVIDENCE_LIMIT, tagAgendaText, type AgendaItemText } from '../../lib/topicTagger';

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

function item(agenda_item_id: number, item_text: string | null): AgendaItemText {
  return { agenda_item_id, item_text };
}

function topicNames(text: string) {
  return tagAgendaText([item(1, text)], CATALOG).map((tag) => tag.topic_name);
}

describe('Topic tagger (SRS-401.4)', () => {
  it('tags only the housing item from the demo seed with Housing', () => {
    const demoItems = [
      item(1, 'Call to order and roll call of members present.'),
      item(2, HOUSING_SENTENCE),
      item(3, 'Approval of the minutes of the August 24, 2026 regular meeting.'),
    ];

    expect(tagAgendaText(demoItems, CATALOG)).toEqual([
      { topic_id: 1, topic_name: 'Housing', agenda_item_id: 2, evidence_text: HOUSING_SENTENCE },
    ]);
  });

  it('ignores case', () => {
    expect(topicNames('HOUSING authority report')).toEqual(['Housing']);
  });

  it('matches whole words only', () => {
    expect(topicNames('Warehousing permit for Canal Street.')).toEqual([]);
    expect(topicNames('Review of new housings.')).toEqual([]);
  });

  it('matches each part of a multi-part topic name', () => {
    expect(topicNames('Bridge Street parking changes.')).toEqual(['Transportation & Parking']);
    expect(topicNames('Discussion of proposed land use changes.')).toEqual(['Zoning & Land Use']);
  });

  it('does not match common single words from multi-word names', () => {
    expect(topicNames('Use of the hall for the spring fair.')).toEqual([]);
    expect(topicNames('Public comment period.')).toEqual([]);
    expect(topicNames('Budget hearing schedule.')).toEqual([]);
  });

  it('returns one tag per topic, from the first matching item', () => {
    const tags = tagAgendaText([item(10, 'First housing item.'), item(11, 'Second housing item.')], CATALOG);

    expect(tags).toEqual([
      { topic_id: 1, topic_name: 'Housing', agenda_item_id: 10, evidence_text: 'First housing item.' },
    ]);
  });

  it('returns every matching topic in catalog order', () => {
    expect(topicNames('Recreation programs near the new housing development.')).toEqual([
      'Housing',
      'Parks & Recreation',
    ]);
  });

  it('returns nothing when there is nothing to tag', () => {
    expect(tagAgendaText([item(1, null), item(2, '   ')], CATALOG)).toEqual([]);
    expect(tagAgendaText([item(1, 'Approval of minutes.')], CATALOG)).toEqual([]);
    expect(tagAgendaText([item(1, HOUSING_SENTENCE)], [])).toEqual([]);
    expect(tagAgendaText([], CATALOG)).toEqual([]);
  });
});

// Issue #511 (SRS-401.5): the passage saved with a tag is the agenda text that
// produced it. Text is never split into sentences, so an abbreviation such as
// "St." or "No." cannot cut the passage short.
describe('Agenda passage saved with a tag (#511)', () => {
  function passage(text: string, catalog = CATALOG): string {
    return tagAgendaText([item(1, text)], catalog)[0].evidence_text;
  }

  // A long agenda item: `before` and `after` are filler words around `middle`.
  function longItem(before: number, middle: string, after: number): string {
    const filler = (count: number, word: string) => Array.from({ length: count }, (_, i) => `${word}${i}`).join(' ');
    return [filler(before, 'before'), middle, filler(after, 'after')].filter((part) => part !== '').join(' ');
  }

  it('keeps the whole line when it has an abbreviation before the match', () => {
    expect(passage('Vote on St. Joseph housing project.')).toBe('Vote on St. Joseph housing project.');
  });

  it.each([
    'Approve Order No. 14 on housing fees.',
    'Request by J. Smith for a housing variance at 5 Elm Ave. Vote expected.',
    'Hearing on housing, e.g. accessory units. Then adjourn.',
    'Housing at 12 Main St. Discussion to follow.',
  ])('keeps the whole item: %s', (text) => {
    expect(passage(text)).toBe(text);
  });

  it('keeps every sentence of an item that fits in the limit', () => {
    const text = 'Opening remarks by the Mayor. The council will vote on the housing plan. Adjournment follows.';

    expect(passage(text)).toBe(text);
  });

  it('keeps an item that is exactly at the limit, and trims one that is a character over', () => {
    const atLimit = `housing ${'x'.repeat(EVIDENCE_LIMIT - 8)}`;
    const overLimit = `housing ${'x '.repeat(EVIDENCE_LIMIT / 2)}end`;

    expect(atLimit).toHaveLength(EVIDENCE_LIMIT);
    expect(passage(atLimit)).toBe(atLimit);
    expect(overLimit.length).toBeGreaterThan(EVIDENCE_LIMIT);
    expect(passage(overLimit).endsWith('…')).toBe(true);
  });

  it('saves real text around the match from a long item, cut at whole words', () => {
    const text = longItem(60, 'the affordable housing contribution', 60);
    const saved = passage(text);
    const body = saved.slice(1, -1);

    expect(saved.startsWith('…')).toBe(true);
    expect(saved.endsWith('…')).toBe(true);
    expect(body.length).toBeLessThanOrEqual(EVIDENCE_LIMIT);
    expect(body).toContain('the affordable housing contribution');
    // The passage is a piece of the item itself, starting and ending at a word.
    const at = text.indexOf(body);
    expect(at).toBeGreaterThan(0);
    expect(text[at - 1]).toBe(' ');
    expect(text[at + body.length]).toBe(' ');
    expect(body).toBe(body.trim());
  });

  it('never cuts a word in half, wherever the match sits', () => {
    for (let padding = 0; padding < 12; padding += 1) {
      const text = longItem(60, ['x'.repeat(padding), 'housing', 'y'.repeat(padding)].filter((word) => word !== '').join(' '), 60);
      const body = passage(text).slice(1, -1);
      const at = text.indexOf(body);

      expect(at).toBeGreaterThan(0);
      expect(text[at - 1]).toBe(' ');
      expect(text[at + body.length]).toBe(' ');
    }
  });

  it('puts the match near the middle of the passage', () => {
    const saved = passage(longItem(60, 'housing', 60));
    const middle = saved.indexOf('housing') + 'housing'.length / 2;

    expect(Math.abs(middle - saved.length / 2)).toBeLessThan(20);
  });

  it('marks only the end when the match is at the start of a long item', () => {
    const saved = passage(longItem(0, 'Housing trust fund report', 80));

    expect(saved.startsWith('Housing trust fund report')).toBe(true);
    expect(saved.endsWith('…')).toBe(true);
    expect(saved.length).toBeLessThanOrEqual(EVIDENCE_LIMIT + 1);
  });

  it('marks only the start when the match is at the end of a long item', () => {
    const saved = passage(longItem(80, 'report on housing.', 0));

    expect(saved.startsWith('…')).toBe(true);
    expect(saved.endsWith('report on housing.')).toBe(true);
    expect(saved.length).toBeLessThanOrEqual(EVIDENCE_LIMIT + 1);
  });

  it('builds the passage around the first match in the item', () => {
    const text = `${longItem(0, 'Parking study update.', 60)} Transportation plan review.`;
    const saved = passage(text, [{ topic_id: 2, name: 'Transportation & Parking' }]);

    expect(saved.startsWith('Parking study update.')).toBe(true);
    expect(saved).not.toContain('Transportation plan review');
  });

  it('writes line breaks and repeated spaces as single spaces', () => {
    expect(passage('  Housing update\n\n  from the   planning office.  ')).toBe('Housing update from the planning office.');
  });
});
