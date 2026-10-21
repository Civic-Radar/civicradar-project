import { describe, expect, it } from 'vitest';
import { tagAgendaText, type AgendaItemText } from '../../lib/topicTagger';

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

  it('returns the sentence that contains the match', () => {
    const text = 'Opening remarks by the Mayor. The council will vote on the housing plan. Adjournment follows.';

    expect(tagAgendaText([item(1, text)], CATALOG)).toEqual([
      { topic_id: 1, topic_name: 'Housing', agenda_item_id: 1, evidence_text: 'The council will vote on the housing plan.' },
    ]);
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
