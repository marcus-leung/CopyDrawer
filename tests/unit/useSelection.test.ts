import { describe, expect, it } from 'vitest';
import { pickAll, pickRange, togglePick } from '@/lib/useSelection';

const list = ['a', 'b', 'c', 'd', 'e'];

describe('picking', () => {
  it('toggles in pick order', () => {
    expect(togglePick(['c'], 'a')).toEqual(['c', 'a']);
    expect(togglePick(['c', 'a'], 'c')).toEqual(['a']);
  });

  it('ranges from the last pick, in the order the list shows, either way', () => {
    expect(pickRange(['b'], 'd', list)).toEqual(['b', 'c', 'd']);
    expect(pickRange(['d'], 'b', list)).toEqual(['d', 'c', 'b']);
  });

  it('keeps earlier picks first and never adds one twice', () => {
    expect(pickRange(['c', 'a'], 'c', list)).toEqual(['c', 'a', 'b']);
    expect(pickAll(['d'], list)).toEqual(['d', 'a', 'b', 'c', 'e']);
  });

  it('without the last pick in this list (deleted, or filtered out), Shift-click just picks the clip', () => {
    expect(pickRange(['gone'], 'c', list)).toEqual(['gone', 'c']);
    expect(pickRange([], 'c', list)).toEqual(['c']);
    expect(pickRange(['c'], 'c', list)).toEqual(['c']);
  });
});
