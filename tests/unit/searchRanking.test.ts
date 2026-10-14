import { describe, expect, it } from 'vitest';
import type { Clip } from '@/lib/db';
import { detectKind, makeTitle } from '@/lib/clips';
import { NO_FILTERS, searchClips } from '@/lib/search';
import { rankByQuery } from '@/lib/rank';
import dataset from './fixtures/search-dataset.json';

/**
 * 148 made-up clips from one person's few months of copying, and 48 searches written by someone else:
 * exact words, different words for the same thing, vague memories, and searches that should find nothing.
 */
const clips: Clip[] = dataset.clips
  .map((c, i) => {
    const kind = detectKind(c.text);
    return {
      id: c.id,
      text: c.text,
      title: makeTitle(c.text, kind),
      kind,
      source: c.sourceUrl ? { url: c.sourceUrl, title: c.sourceTitle ?? '' } : undefined,
      createdAt: i,
      lastUsedAt: 0,
      useCount: 0,
      pinned: 0 as const,
      hash: '',
    };
  })
  .reverse();

type Style = 'exact' | 'paraphrase' | 'vague';

function foundInTop5(sort: 'best' | 'newest') {
  const counts: Record<Style, number> = { exact: 0, paraphrase: 0, vague: 0 };
  for (const q of dataset.queries) {
    if (q.style === 'none') continue;
    const top = searchClips(q.q, clips, { ...NO_FILTERS, sort }).slice(0, 5);
    if (top.some((c) => q.targets.includes(c.id))) counts[q.style as Style]++;
  }
  return counts;
}

describe('best match on a realistic history', () => {
  it('finds clips described in other words or half remembered, without losing exact matches', () => {
    const before = foundInTop5('newest');
    const after = foundInTop5('best');
    expect(before).toEqual({ exact: 14, paraphrase: 4, vague: 1 });
    expect(after.exact).toBe(15);
    expect(after.paraphrase).toBeGreaterThanOrEqual(10);
    expect(after.vague).toBeGreaterThanOrEqual(7);
  });

  it('puts clips with every word first, in the order every-word search found them', () => {
    for (const q of dataset.queries) {
      const allWords = searchClips(q.q, clips, { ...NO_FILTERS, sort: 'newest' });
      const best = searchClips(q.q, clips, NO_FILTERS);
      expect(new Set(best.slice(0, allWords.length))).toEqual(new Set(allWords));
    }
  });
});

describe('rankByQuery', () => {
  const items = [
    { title: 'Quarterly revenue report', body: '' },
    { title: 'Revenue', body: 'revenue revenue revenue' },
    { title: 'Lunch', body: 'quarterly team lunch' },
    { title: 'Nothing here', body: 'unrelated' },
  ];
  const rank = (q: string) => rankByQuery(items, q, (i) => i).map((i) => i.title);

  it('ranks clips with every word first; a longer query needs half its words', () => {
    expect(rank('quarterly revenue')).toEqual(['Quarterly revenue report', 'Revenue', 'Lunch']);
    expect(rank('quarterly revenue zebra yak')).toEqual(['Quarterly revenue report']);
    expect(rank('quarterly zebra yak gnu')).toEqual([]);
  });

  it('ignores filler words', () => {
    expect(rank('the lunch of the team')).toEqual(['Lunch']);
  });

  it('matches word starts and small typos', () => {
    expect(rank('quart')).toEqual(['Quarterly revenue report', 'Lunch']);
    expect(rank('revenu')).toContain('Revenue');
    expect(rank('luncj')).toEqual(['Lunch']);
  });

  it('finds punctuation as typed when the query has no letters or digits', () => {
    const found = (q: string) =>
      rankByQuery(
        [
          { title: 'sam@example.com', body: '' },
          { title: 'https://example.com', body: '' },
          { title: 'Lunch', body: '' },
        ],
        q,
        (i) => i,
      ).map((i) => i.title);
    expect(found('@')).toEqual(['sam@example.com']);
    expect(found('://')).toEqual(['https://example.com']);
  });

  it('keeps the given order without a query', () => {
    expect(rank('  ')).toEqual(items.map((i) => i.title));
  });
});
