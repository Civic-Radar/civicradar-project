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

// "Zoning & Land Use" -> [["zoning"], ["land", "use"]]: the parts of a topic
// name, each as its words' stems. A multi-word part must match as a whole, so
// common words like "use" or "public" never match on their own.
function topicPhrases(name: string): string[][] {
  return name
    .split(/&|,|\band\b/i)
    .map((part) => words(part).map((word) => word.stem))
    .filter((part) => part.length > 0);
}

// stem: the word compared (see stem()). named: true when the word starts with
// a capital letter or is not the stem itself (a plural such as "parks").
type Word = { stem: string; named: boolean; start: number; end: number };

// The words of a text with where each one is. A hyphen or any other mark
// separates words, so "land-use" is "land" and "use".
function words(text: string): Word[] {
  return Array.from(text.matchAll(/[\p{L}\p{N}]+/gu), (match) => ({
    stem: stem(match[0]),
    named: /^\p{Lu}/u.test(match[0]) || stem(match[0]) !== match[0].toLowerCase(),
    start: match.index as number,
    end: (match.index as number) + match[0].length,
  }));
}

// A word in lower case with a plural ending removed (issue #507), so "Taxes"
// and "tax", or "Parks" and "park", compare equal. Only plural endings are
// removed: "parking" stays "parking", so it never matches Parks & Recreation.
function stem(word: string): string {
  const lower = word.toLowerCase();
  if (lower.length > 4 && lower.endsWith('ies')) return `${lower.slice(0, -3)}y`;
  if (/(?:x|z|ch|sh|ss)es$/.test(lower)) return lower.slice(0, -2);
  if (lower.length > 3 && lower.endsWith('s') && !lower.endsWith('ss')) return lower.slice(0, -1);
  return lower;
}

// Topic words that are also common everyday words in the singular: "park"
// is a verb ("residents may park") as often as a place. In the singular they
// count only as a name, with a capital letter ("Memorial Park", "Park & Rec");
// the plural ("city parks") always counts. Issue #507.
const NAME_ONLY = new Set(['park']);

// Words that make the word before them part of a street address ("Hale Park
// Ave.", "12 Housing St."), which is never a mention of the topic.
const STREET_WORDS = new Set(['ave', 'avenue', 'st', 'street', 'rd', 'road', 'dr', 'drive', 'blvd', 'boulevard', 'ln', 'lane', 'way']);

// Whether the word at `index` counts as the topic word `topic`: the stems are
// equal, or the word is the topic word with "re" in front ("rezoning" for
// "zoning"). It never counts as part of a street address, and a NAME_ONLY word
// counts only as a name.
function sameWord(text: Word[], index: number, topic: string): boolean {
  const word = text[index];
  if (word.stem !== topic && word.stem !== `re${topic}`) return false;
  if (index + 1 < text.length && STREET_WORDS.has(text[index + 1].stem)) return false;
  if (NAME_ONLY.has(topic) && !word.named) return false;
  return true;
}

// The most other words allowed between the words of a multi-word topic part,
// so "school department budget" is School Budget but a sentence that mentions
// "public" and later "safety" is not Public Safety.
const MAX_WORDS_BETWEEN = 1;

// Where the first of the topic's parts appears in the text, or null. A
// multi-word part matches when all its words appear, in any order, with at most
// MAX_WORDS_BETWEEN other words between each.
function firstMatch(text: Word[], phrases: string[][]): { start: number; end: number } | null {
  for (let i = 0; i < text.length; i += 1) {
    for (const phrase of phrases) {
      if (!phrase.some((word) => sameWord(text, i, word))) continue;
      const missing = new Set(phrase);
      const last = Math.min(i + phrase.length - 1 + (phrase.length - 1) * MAX_WORDS_BETWEEN, text.length - 1);
      for (let j = i; j <= last; j += 1) {
        const found = [...missing].find((word) => sameWord(text, j, word));
        if (found !== undefined) missing.delete(found);
        if (missing.size === 0) return { start: text[i].start, end: text[j].end };
      }
    }
  }
  return null;
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
    .filter((item) => item.text !== '')
    .map((item) => ({ ...item, words: words(item.text) }));

  const tags: TopicTag[] = [];
  for (const topic of topics) {
    const phrases = topicPhrases(topic.name);
    if (phrases.length === 0) continue;

    // First matching item in agenda order, then the first match in its text.
    for (const item of itemTexts) {
      const match = firstMatch(item.words, phrases);
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
