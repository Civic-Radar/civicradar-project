// SRS-401.4, EG, Topic tagging: demo seed (Task 401.4-1)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(process.cwd(), 'supabase/seed_topic_tagging_demo.sql'), 'utf8');

// Each agenda row: (v_meeting_id, '<source id>', <sort>, '<title>', '<text>')
const items = [
  ...sql.matchAll(/\(v_meeting_id, '([^']+)', (\d+), '([^']+)',\s*'([^']+)'\)/g),
].map(([, sourceItemId, sortOrder, title, itemText]) => ({
  sourceItemId,
  sortOrder: Number(sortOrder),
  title,
  itemText,
}));

describe('Topic tagging demo seed (SRS-401.4)', () => {
  it('adds the three demo agenda items in order', () => {
    expect(items.map(({ sourceItemId, sortOrder, title }) => ({ sourceItemId, sortOrder, title }))).toEqual([
      { sourceItemId: 'demo-401.4-call-to-order', sortOrder: 0, title: 'Call to Order' },
      { sourceItemId: 'demo-401.4-housing', sortOrder: 1, title: 'Affordable Housing Trust Fund Allocation' },
      { sourceItemId: 'demo-401.4-minutes', sortOrder: 2, title: 'Approval of Minutes' },
    ]);
  });

  it('has agenda text about housing in only the housing item', () => {
    const mentionsHousing = items.filter((item) => /housing/i.test(item.itemText)).map((item) => item.sourceItemId);
    expect(mentionsHousing).toEqual(['demo-401.4-housing']);
  });

  it('adds Housing only when no active Housing topic exists', () => {
    expect(sql).toMatch(
      /insert into topics \(name\)\s+select 'Housing'\s+where not exists \(\s*select 1 from topics\s+where lower\(name\) = 'housing' and removed_at is null\s*\)/,
    );
  });

  it('skips agenda items that already exist', () => {
    expect(sql).toContain('on conflict (meeting_id, source_item_id) do nothing');
  });

  it('stops with a clear error when the demo meeting is missing', () => {
    expect(sql).toMatch(/raise exception '[^']*demo-2026-09-14[^']*seed_extraction_demo\.sql first\.'/);
  });
});
