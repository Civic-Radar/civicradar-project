// Topic tagging (SRS-401.4): matches agenda text against the topic catalog and
// returns each matching topic with the agenda text that produced it (SRS-401.5).
// Pure function: callers pass active topics and non-removed agenda items in
// agenda order.

// The longest passage saved with a tag, not counting the "…" marks. An agenda
// item up to this length is saved whole; a longer one is cut down to the text
// around the match.
export const EVIDENCE_LIMIT = 200;

export type CatalogTopic = { topic_id: number; name: string };
export type AgendaItemText = { agenda_item_id: number; item_text: string | null };
export type TopicTag = {
  topic_id: number;
  topic_name: string;
  agenda_item_id: number; // the item whose text produced the tag
  evidence_text: string; // the item's text, or the part around the match; never empty
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

// Where the first of the topic's phrases appears in the text, or null.
function firstMatch(text: string, patterns: RegExp[]): { start: number; end: number } | null {
  let first: { start: number; end: number } | null = null;
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && (first === null || match.index < first.start)) {
      first = { start: match.index, end: match.index + match[0].length };
    }
  }
  return first;
}

// The passage saved for a match (issue #511). Text is never split into
// sentences, because a period also ends abbreviations such as "St." and "No.",
// and a split there cut the passage short. A long item is cut to about
// EVIDENCE_LIMIT characters with the match in the middle, at whole words, and
// "…" marks each side where text was left out.
function passageAround(text: string, match: { start: number; end: number }): string {
  if (text.length <= EVIDENCE_LIMIT) return text;

  const room = Math.max(EVIDENCE_LIMIT - (match.end - match.start), 0);
  let start = Math.max(match.start - Math.floor(room / 2), 0);
  let end = Math.min(start + EVIDENCE_LIMIT, text.length);
  start = Math.max(Math.min(start, end - EVIDENCE_LIMIT), 0);

  // Move each cut inward to a space, never into the matched words.
  if (start > 0 && text[start - 1] !== ' ') {
    const space = text.indexOf(' ', start);
    start = space !== -1 && space < match.start ? space + 1 : match.start;
  }
  if (end < text.length && text[end] !== ' ') {
    const space = text.lastIndexOf(' ', end);
    end = space >= match.end ? space : match.end;
  }

  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

export function tagAgendaText(items: AgendaItemText[], topics: CatalogTopic[]): TopicTag[] {
  // Line breaks and repeated spaces become single spaces, so a passage reads as one line.
  const itemTexts = items
    .map((item) => ({ agenda_item_id: item.agenda_item_id, text: (item.item_text ?? '').replace(/\s+/g, ' ').trim() }))
    .filter((item) => item.text !== '');

  const tags: TopicTag[] = [];
  for (const topic of topics) {
    const patterns = topicPhrases(topic.name).map(phrasePattern);
    if (patterns.length === 0) continue;

    // First matching item in agenda order, then the first match in its text.
    for (const item of itemTexts) {
      const match = firstMatch(item.text, patterns);
      if (match) {
        tags.push({
          topic_id: topic.topic_id,
          topic_name: topic.name,
          agenda_item_id: item.agenda_item_id,
          evidence_text: passageAround(item.text, match),
        });
        break;
      }
    }
  }
  return tags;
}
