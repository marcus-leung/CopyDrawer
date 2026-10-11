import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { ClipDatabase, type Clip } from '@/lib/db';
import { detectKind } from '@/lib/kinds';
import { detectActions, plainNumber } from '@/lib/actions';
import { NO_FILTERS, searchClips, sortClips } from '@/lib/search';

describe('detectKind', () => {
  it('names a clip by what the whole of it is', () => {
    const cases: [string, string][] = [
      ['https://example.com/a', 'link'],
      ['jane.doe+work@example.co.uk', 'email'],
      ['#2457C5', 'color'],
      ['rgb(36, 87, 197)', 'color'],
      ['hsl(220, 69%, 46%)', 'color'],
      ['#fff', 'color'],
      ['{"a": 1, "b": [2, 3]}', 'json'],
      ['[1, 2, 3]', 'json'],
      ['+1 (415) 555-0134', 'phone'],
      ['415-555-0134', 'phone'],
      ['+44 20 7946 0958', 'phone'],
      ['+14155550134', 'phone'],
      ['4155550134', 'number'],
      ['$1,299.00', 'number'],
      ['-12.5%', 'number'],
      ['€12,50', 'number'],
      ['1 000 000', 'number'],
      ['42', 'number'],
      ['2026', 'number'],
      ['March 14, 2027', 'date'],
      ['Sat 18 Oct 2026, 9 PM', 'date'],
      ['2026-10-14', 'date'],
      ['1600 Amphitheatre Parkway, Mountain View, CA 94043', 'address'],
      ['221B Baker Street, London NW1 6XE', 'address'],
      ['const a = 1;\nconsole.log(a);', 'code'],
      ['SELECT id FROM orders WHERE total > 10', 'code'],
      ['Just a sentence.', 'text'],
    ];
    for (const [text, kind] of cases) expect([text, detectKind(text)]).toEqual([text, kind]);
  });

  it('keeps text that only contains something, and look-alikes, as text', () => {
    for (const text of [
      'Write to jane@example.com about it',
      'Call me at 415-555-0134 tomorrow',
      'Meet on March 14, 2027 at the office',
      'We live at 221B Baker Street, it is lovely',
      '1Z 999 AA1 01 2345 6784',
      'bad',
      'decade',
      '2457c5',
      '2FA',
      'e2e',
      'c0ffee',
      'dab4a84e',
      '192.168.1.1',
      '{not json}',
      '',
    ])
      expect([text, detectKind(text)]).toEqual([text, 'text']);
  });
});

describe('actions follow the type', () => {
  it('offers only what the clip was saved as', () => {
    expect(detectActions({ kind: 'text', text: 'decade' }).note).toBeUndefined();
    const date = detectActions({ kind: 'date', text: '2026-10-14' }).actions.map((a) => a.label);
    expect(date).toContain('Add 2026-10-14 to calendar');
    expect(date).not.toContain('Call');
    expect(detectActions({ kind: 'phone', text: '+1 (415) 555-0134' }).actions.map((a) => a.label)).toEqual(['Call']);
    expect(detectActions({ kind: 'color', text: '#2457C5' }).note).toBe('Looks like a color');
    expect(detectActions({ kind: 'text', text: '{"a": 1}' }).json).toBeUndefined();
  });
});

describe('number clips', () => {
  it('copies the bare number', () => {
    expect(plainNumber('$1,299.00')).toBe('1299.00');
    expect(plainNumber('€12,50')).toBe('12.50');
    expect(plainNumber('−3 %')).toBe('-3');
    const actions = detectActions({ kind: 'number', text: '$1,299.00' }).actions;
    expect(actions).toEqual([{ kind: 'copy', label: 'Copy number only', text: '1299.00' }]);
    expect(detectActions({ kind: 'number', text: '42' }).actions).toEqual([]);
  });
});

describe('sort and type search', () => {
  const clip = (id: string, extra: Partial<Clip>): Clip => ({
    id,
    createdAt: 0,
    lastUsedAt: 0,
    useCount: 0,
    kind: 'text',
    text: id,
    title: id,
    pinned: 0,
    hash: id,
    ...extra,
  });
  const clips = [
    clip('banana', { createdAt: 3, useCount: 1 }),
    clip('apple', { createdAt: 1, useCount: 5 }),
    clip('cherry', { createdAt: 2, pinned: 1 }),
    clip('jane@example.com', { createdAt: 4, kind: 'email' }),
  ];
  const ids = (cs: Clip[]) => cs.map((c) => c.id);

  it('sorts with pinned clips first', () => {
    expect(ids(sortClips(clips, 'newest'))).toEqual(['cherry', 'jane@example.com', 'banana', 'apple']);
    expect(ids(sortClips(clips, 'oldest'))).toEqual(['cherry', 'apple', 'banana', 'jane@example.com']);
    expect(ids(sortClips(clips, 'used'))).toEqual(['cherry', 'apple', 'banana', 'jane@example.com']);
    expect(ids(sortClips(clips, 'az'))).toEqual(['cherry', 'apple', 'banana', 'jane@example.com']);
    expect(ids(searchClips('', clips, { ...NO_FILTERS, sort: 'oldest' }))).toEqual([
      'cherry',
      'apple',
      'banana',
      'jane@example.com',
    ]);
  });

  it('finds clips by their type and filters by it', () => {
    expect(ids(searchClips('email', clips, NO_FILTERS))).toEqual(['jane@example.com']);
    expect(ids(searchClips('', clips, { ...NO_FILTERS, kind: 'email' }))).toEqual(['jane@example.com']);
  });
});

describe('database upgrade to types', () => {
  it('gives clips saved as text their new type', async () => {
    const name = `test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(4).stores({
      clips: 'id, createdAt, lastUsedAt, pinned, kind, hash, collectionId',
      images: 'id',
      collections: 'id, &key, order',
    });
    await old.table('clips').bulkAdd([
      { id: 'e', createdAt: 1, kind: 'text', text: 'jane@example.com', title: 'jane@example.com' },
      { id: 'j', createdAt: 2, kind: 'code', text: '{\n  "a": 1\n}', title: '{' },
      { id: 't', createdAt: 3, kind: 'text', text: 'hello there', title: 'hello there' },
      { id: 'l', createdAt: 4, kind: 'link', text: 'https://a.test', title: 'a.test' },
    ]);
    old.close();
    const upgraded = new ClipDatabase(name);
    const kinds = Object.fromEntries((await upgraded.clips.toArray()).map((c) => [c.id, c.kind]));
    expect(kinds).toEqual({ e: 'email', j: 'json', t: 'text', l: 'link' });
  });

  it('turns bare hex saved as a color back into text', async () => {
    const name = `test-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(5).stores({
      clips: 'id, createdAt, lastUsedAt, pinned, kind, hash, collectionId',
      images: 'id',
      collections: 'id, &key, order',
    });
    await old.table('clips').bulkAdd([
      { id: 'sha', createdAt: 1, kind: 'color', text: 'dab4a84e', title: 'dab4a84e' },
      { id: 'hex', createdAt: 2, kind: 'color', text: '#2457C5', title: '#2457C5' },
    ]);
    old.close();
    const upgraded = new ClipDatabase(name);
    const kinds = Object.fromEntries((await upgraded.clips.toArray()).map((c) => [c.id, c.kind]));
    expect(kinds).toEqual({ sha: 'text', hex: 'color' });
  });
});
