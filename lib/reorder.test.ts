import { describe, expect, it } from 'vitest';
import { moveInOrder } from './reorder';

describe('moving an exercise up or down', () => {
  it('swaps with the neighbour', () => {
    expect(moveInOrder(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
  });

  it('does nothing at either end or for an unknown id', () => {
    expect(moveInOrder(['a', 'b'], 'a', -1)).toBeNull();
    expect(moveInOrder(['a', 'b'], 'b', 1)).toBeNull();
    expect(moveInOrder(['a', 'b'], 'x', 1)).toBeNull();
  });

  it('leaves the list it was given alone', () => {
    const ids = ['a', 'b'];
    moveInOrder(ids, 'a', 1);
    expect(ids).toEqual(['a', 'b']);
  });
});
