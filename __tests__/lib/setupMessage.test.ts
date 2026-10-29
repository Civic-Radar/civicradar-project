import { describe, expect, it } from 'vitest';
import { getMissingSelection, SETUP_MESSAGES } from '../../lib/setupMessage';

// The followed-towns and followed-topics routes return every catalog entry with
// a followed flag, so "missing" means nothing is followed, not an empty list.
const followed = { followed: true };
const notFollowed = { followed: false };

describe('Setup message rule (SRS-401.8)', () => {
  it('names towns when the resident follows two topics and no towns', () => {
    expect(getMissingSelection([notFollowed, notFollowed], [followed, followed])).toBe('towns');
  });

  it('names topics when the resident follows towns but no topics', () => {
    expect(getMissingSelection([followed, notFollowed], [notFollowed, notFollowed])).toBe('topics');
  });

  it('names both when the resident follows no towns and no topics', () => {
    expect(getMissingSelection([notFollowed, notFollowed], [notFollowed, notFollowed])).toBe('both');
  });

  it('names both when there are no towns or topics to follow', () => {
    expect(getMissingSelection([], [])).toBe('both');
  });

  it('shows no message once one town and one topic are followed', () => {
    expect(
      getMissingSelection([notFollowed, followed, notFollowed], [notFollowed, notFollowed, followed]),
    ).toBeNull();
  });
});

describe('Setup message wording (SRS-401.8)', () => {
  it('names only towns in the towns message', () => {
    const { title, link } = SETUP_MESSAGES.towns;
    expect(`${title} ${link}`).toMatch(/towns/);
    expect(`${title} ${link}`).not.toMatch(/topics/);
  });

  it('names only topics in the topics message', () => {
    const { title, link } = SETUP_MESSAGES.topics;
    expect(`${title} ${link}`).toMatch(/topics/);
    expect(`${title} ${link}`).not.toMatch(/towns/);
  });

  it('names towns and topics in the both message', () => {
    for (const text of [SETUP_MESSAGES.both.title, SETUP_MESSAGES.both.link]) {
      expect(text).toMatch(/towns/);
      expect(text).toMatch(/topics/);
    }
  });
});
