import { describe, expect, it } from 'vitest';
import { DUMBBELL_FRAMES, hourglassFrame, hourglassSideways } from './fx-sprites';
import { DEFAULT_LOOK } from './game/cosmetics';
import { heroPixels, heroRunFrame } from './game/sprites';

const count = (rows: string[], ch: string) => rows.join('').split(ch).length - 1;

describe('loading dumbbell', () => {
  it('is four square frames, each with plates and a bar', () => {
    expect(DUMBBELL_FRAMES).toHaveLength(4);
    for (const f of DUMBBELL_FRAMES) {
      expect(f).toHaveLength(12);
      for (const row of f) expect(row).toHaveLength(12);
      expect(count(f, '#')).toBeGreaterThan(8);
      expect(count(f, '*')).toBeGreaterThan(0);
    }
  });

  it('turns: no two neighbouring frames are the same', () => {
    for (let i = 0; i < 4; i++) expect(DUMBBELL_FRAMES[i]).not.toEqual(DUMBBELL_FRAMES[(i + 1) % 4]);
  });
});

describe('rest hourglass', () => {
  const sand = (rows: string[], from: number, to: number) => count(rows.slice(from, to), '*');

  it('starts with all the sand on top and ends with it all below', () => {
    const full = hourglassFrame(1, false);
    const done = hourglassFrame(0, false);
    expect(sand(full, 0, 5)).toBeGreaterThan(0);
    expect(sand(full, 6, 11)).toBe(0);
    expect(sand(done, 0, 5)).toBe(0);
    expect(sand(done, 6, 11)).toBe(sand(full, 0, 5));
  });

  it('never loses or gains sand as it drains', () => {
    const total = count(hourglassFrame(1, false), '*');
    for (const left of [0.9, 0.5, 0.25, 0.1]) expect(count(hourglassFrame(left, false), '*')).toBe(total);
  });

  it('turns on its side for the flip', () => {
    const side = hourglassSideways();
    const up = hourglassFrame(0, false);
    expect(side).toHaveLength(up[0].length);
    expect(side[0]).toHaveLength(up.length);
  });
});

describe('running hero', () => {
  it('keeps the standing size and changes between frames', () => {
    const stand = heroPixels(DEFAULT_LOOK);
    const frames = [0, 1, 2, 3].map((k) => heroRunFrame(DEFAULT_LOOK, k));
    for (const f of frames) {
      expect(f).toHaveLength(stand.length);
      expect(f[0]).toHaveLength(stand[0].length);
    }
    expect(JSON.stringify(frames[0])).not.toBe(JSON.stringify(frames[2]));
  });
});
