// Tests for the search helpers (SRS-506.2, SRS-506.3, SRS-507.1).
import { describe, expect, it } from 'vitest';
import { anyTermFilter, hrefWithQuery, matchRanges, rankResults, searchTerms, termScore, type SearchResult } from '../../lib/search';

describe('searchTerms', () => {
  it('returns null for an empty or whitespace-only query, so no search runs (SRS-506.3)', () => {
    for (const query of ['', '   ', '\t\n ', null, undefined, 42]) {
      expect(searchTerms(query)).toBeNull();
    }
  });

  it('splits an everyday-language query into lowercase words (SRS-506.2)', () => {
    expect(searchTerms('Parking  downtown')).toEqual(['parking', 'downtown']);
  });

  it('drops common words unless nothing else is left', () => {
    expect(searchTerms('meetings about the school budget')).toEqual(['meetings', 'school', 'budget']);
    expect(searchTerms('the')).toEqual(['the']);
  });

  it('removes punctuation so a term is safe inside a database filter', () => {
    expect(searchTerms('zoning, (Bridge St.) %_*')).toEqual(['zoning', 'bridge', 'st']);
    expect(searchTerms('!!!')).toEqual([]);
  });

  it('keeps hyphens inside words and drops repeats', () => {
    expect(searchTerms('fiber-optic fiber-optic')).toEqual(['fiber-optic']);
  });
});

describe('anyTermFilter', () => {
  it('matches any term in any column', () => {
    expect(anyTermFilter(['title', 'location'], ['parking', 'downtown'])).toBe(
      'title.ilike.%parking%,title.ilike.%downtown%,location.ilike.%parking%,location.ilike.%downtown%',
    );
  });
});

describe('ranking', () => {
  const result = (type: SearchResult['type'], title: string, score: number): SearchResult => ({
    type, key: `${type}-${title}`, title, detail: null, href: '/', score,
  });

  it('counts how many terms appear in the text', () => {
    expect(termScore(['Downtown Parking Plan', null], ['parking', 'downtown', 'budget'])).toBe(2);
  });

  it('puts results matching more terms first, then a fixed type order', () => {
    const ranked = rankResults([
      result('Official', 'Ann Lee', 1),
      result('Document', 'Parking downtown memo', 2),
      result('Meeting', 'Traffic Commission', 1),
    ]);
    expect(ranked.map((r) => r.title)).toEqual(['Parking downtown memo', 'Traffic Commission', 'Ann Lee']);
  });
});

describe('highlighting helpers', () => {
  it('finds every place a word appears, ignoring case', () => {
    expect(matchRanges('School budget for the school year', ['school'])).toEqual([[0, 6], [22, 28]]);
  });

  it('merges overlapping matches from different words', () => {
    expect(matchRanges('Downtown parking', ['down', 'downtown', 'park'])).toEqual([[0, 8], [9, 13]]);
  });

  it('finds nothing without words or text', () => {
    expect(matchRanges('School', [])).toEqual([]);
    expect(matchRanges('', ['school'])).toEqual([]);
  });

  it('adds the search words to a result link', () => {
    expect(hrefWithQuery('/meetings/1192', 'school budget')).toBe('/meetings/1192?q=school%20budget');
    expect(hrefWithQuery('/officials?tab=all', 'Lee')).toBe('/officials?tab=all&q=Lee');
  });
});
