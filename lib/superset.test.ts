import { describe, expect, it } from 'vitest';
import { afterSupersetTick, groupForLink, supersetLabels } from './superset';

const ex = (id: string, g: string | null = null) => ({ id, supersetGroup: g });

describe('superset labels', () => {
  it('letters groups by first appearance and numbers members', () => {
    const labels = supersetLabels([ex('a', 'x'), ex('b', 'x'), ex('c'), ex('d', 'y'), ex('e', 'y'), ex('f', 'y')]);
    expect(Object.fromEntries(labels)).toEqual({ a: 'A1', b: 'A2', d: 'B1', e: 'B2', f: 'B3' });
  });

  it('ignores a group of one', () => {
    expect(supersetLabels([ex('a', 'x'), ex('b')]).size).toBe(0);
  });
});

describe('resting in a superset', () => {
  const workout = [ex('bench', 'g'), ex('row', 'g'), ex('curl')];

  it('goes straight to the partner after the first exercise, with no rest', () => {
    expect(afterSupersetTick(workout, 'bench')).toEqual({ rest: false, nextCurrentId: 'row' });
  });

  it('rests after the last one and comes back round to the first', () => {
    expect(afterSupersetTick(workout, 'row')).toEqual({ rest: true, nextCurrentId: 'bench' });
  });

  it('rests as normal outside a superset', () => {
    expect(afterSupersetTick(workout, 'curl')).toEqual({ rest: true, nextCurrentId: 'curl' });
    expect(afterSupersetTick([ex('a', 'lonely')], 'a')).toEqual({ rest: true, nextCurrentId: 'a' });
  });

  it('handles three in a row', () => {
    const tri = [ex('a', 't'), ex('b', 't'), ex('c', 't')];
    expect(afterSupersetTick(tri, 'b')).toEqual({ rest: false, nextCurrentId: 'c' });
    expect(afterSupersetTick(tri, 'c')).toEqual({ rest: true, nextCurrentId: 'a' });
  });
});

describe('linking with the next exercise', () => {
  it('joins an existing group, else starts one', () => {
    expect(groupForLink(ex('a'), ex('b', 'g1'), 'new')).toBe('g1');
    expect(groupForLink(ex('a', 'g0'), ex('b'), 'new')).toBe('g0');
    expect(groupForLink(ex('a'), ex('b'), 'new')).toBe('new');
  });
});
