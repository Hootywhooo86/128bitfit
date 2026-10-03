import { describe, expect, it } from 'vitest';
import { readAllPages } from './paging';

describe('reading every page', () => {
  it('follows page tokens to the end', async () => {
    const pages: Record<string, { records: number[]; pageToken?: string }> = {
      start: { records: [1, 2], pageToken: 'b' },
      b: { records: [3, 4], pageToken: 'c' },
      c: { records: [5] },
    };
    const seen: (string | undefined)[] = [];
    const all = await readAllPages(async (t) => {
      seen.push(t);
      return pages[t ?? 'start'];
    });
    expect(all).toEqual([1, 2, 3, 4, 5]);
    expect(seen).toEqual([undefined, 'b', 'c']);
  });

  it('stops on a token that repeats instead of looping forever', async () => {
    let calls = 0;
    const all = await readAllPages(async () => {
      calls += 1;
      return { records: [calls], pageToken: 'same' };
    });
    expect(calls).toBe(2);
    expect(all).toEqual([1, 2]);
  });

  it('is fine with one empty page', async () => {
    expect(await readAllPages(async () => ({ records: [] }))).toEqual([]);
  });
});
