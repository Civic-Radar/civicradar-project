// Topic tagging (SRS-401.4): matches agenda text against the topic catalog and
// returns each matching topic with the agenda sentence that produced it.
// Pure function: callers pass active topics and non-removed agenda items in
// agenda order.

export type CatalogTopic = { topic_id: number; name: string };
export type AgendaItemText = { agenda_item_id: number; item_text: string | null };
export type TopicTag = {
  topic_id: number;
  topic_name: string;
  agenda_item_id: number; // the item whose text produced the tag
  evidence_text: string; // the matching sentence, trimmed, never empty
};

// "Zoning & Land Use" -> ["zoning", "land use"]. Multi-word parts must match
// as a whole, so common words like "use" or "public" never match on their own.
function topicPhrases(name: string): string[] {
  return name
    .split(/&|,|\band\b/i)
    .map((part) => part.trim().replace(/\s+/g, ' '))
    .filter((part) => part !== '');
}

function phrasePattern(phrase: string): RegExp {
  const escaped = phrase
    .split(' ')
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  // Whole words: no letter or digit directly before or after the phrase.
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu');
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '');
}

export function tagAgendaText(items: AgendaItemText[], topics: CatalogTopic[]): TopicTag[] {
  const itemSentences = items
    .filter((item) => item.item_text !== null && item.item_text.trim() !== '')
    .map((item) => ({ agenda_item_id: item.agenda_item_id, sentences: sentences(item.item_text as string) }));

  const tags: TopicTag[] = [];
  for (const topic of topics) {
    const patterns = topicPhrases(topic.name).map(phrasePattern);
    if (patterns.length === 0) continue;

    // First matching item in agenda order, then its first matching sentence.
    search: for (const item of itemSentences) {
      for (const sentence of item.sentences) {
        if (patterns.some((pattern) => pattern.test(sentence))) {
          tags.push({
            topic_id: topic.topic_id,
            topic_name: topic.name,
            agenda_item_id: item.agenda_item_id,
            evidence_text: sentence,
          });
          break search;
        }
      }
    }
  }
  return tags;
}
