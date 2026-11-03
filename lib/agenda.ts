// SRS-502.6: agenda item text for the meeting details page's timeline.

// The text to show under an agenda item's title. The stored text starts with the
// item's name, whose first line is the title, so that line is left out here and
// only what comes after it (the rest of the name and the description) is shown.
// null when nothing is left.
export function agendaDetail(item: { title: string; item_text: string | null }): string | null {
  const title = item.title.trim();
  const lines = (item.item_text ?? '').split('\n');
  const first = (lines[0] ?? '').trim();
  if (title !== '' && first.startsWith(title)) {
    // A long title is stored cut short; keep whatever follows it on that line.
    lines[0] = first.slice(title.length).trim();
  }
  const detail = lines.join('\n').trim();
  return detail === '' ? null : detail;
}
