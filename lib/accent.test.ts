import { afterEach, describe, expect, it } from 'vitest';
import {
  ACCENTS,
  DEFAULT_ACCENT,
  RED_REFUSED,
  TOO_DARK,
  accentName,
  accentProblem,
  applyAccent,
  contrastOnBlack,
  hexToHsv,
  hsvToHex,
  isAccent,
  onAccentFor,
  parseHex,
} from './accent';
import { colors, muscleHeat, muscleRole, themedStyles } from './theme';

afterEach(() => applyAccent(DEFAULT_ACCENT));

describe('accent colour', () => {
  it('is read live, not frozen at import', () => {
    expect(colors.accent).toBe('#ffffff');
    applyAccent('#5aa9ff');
    expect(colors.accent).toBe('#5aa9ff');
    expect(colors.chipActive).toBe('#5aa9ff');
  });

  it('picks readable text for the button it colours', () => {
    expect(onAccentFor('#ffffff')).toBe('#000000');
    expect(onAccentFor('#a78bfa')).toBe('#000000');
    applyAccent('#5aa9ff');
    expect(colors.onAccent).toBe(onAccentFor('#5aa9ff'));
  });

  it('rebuilds styles that read it, once per change', () => {
    let builds = 0;
    const s = themedStyles(() => {
      builds++;
      return { btn: { backgroundColor: colors.accent } };
    });
    expect(builds).toBe(0);
    expect(s.btn.backgroundColor).toBe('#ffffff');
    expect(s.btn.backgroundColor).toBe('#ffffff');
    expect(builds).toBe(1);
    applyAccent('#4be0c8');
    expect(s.btn.backgroundColor).toBe('#4be0c8');
    expect(builds).toBe(2);
  });

  it('ignores a colour that is not on the list', () => {
    applyAccent('#123456');
    expect(colors.accent).toBe(DEFAULT_ACCENT);
  });

  it('never offers a colour the data scale already means something by', () => {
    // Over-target and heavy load are this red. An accent in it would make
    // "your colour" and "you went over" the same thing.
    const reserved = [colors.danger, ...Object.values(muscleHeat), muscleRole.primary, muscleRole.secondary]
      .map((c) => c.toLowerCase());
    for (const a of ACCENTS) expect(reserved, a.name).not.toContain(a.hex);
  });
});

describe('custom accent', () => {
  it('reads colour codes the way people type them', () => {
    expect(parseHex('#7AF0C3')).toBe('#7af0c3');
    expect(parseHex('7af0c3')).toBe('#7af0c3');
    expect(parseHex(' #7fc ')).toBe('#77ffcc');
    expect(parseHex('#7af0c')).toBeNull();
    expect(parseHex('green')).toBeNull();
    expect(parseHex('')).toBeNull();
    expect(parseHex(null)).toBeNull();
  });

  it('every preset passes the guard rails', () => {
    for (const a of ACCENTS) expect(accentProblem(a.hex), a.name).toBeNull();
  });

  it('refuses red, including the heat scale and over-target red itself', () => {
    expect(accentProblem(muscleHeat.heavy)).toBe(RED_REFUSED);
    expect(accentProblem('#ff0000')).toBe(RED_REFUSED);
    expect(accentProblem('#ff2a00')).toBe(RED_REFUSED); // hue ~10°
    expect(accentProblem('#ff0033')).toBe(RED_REFUSED); // hue ~348°
    expect(accentProblem('#ff9999')).toBe(RED_REFUSED); // pale, but still red
  });

  it('keeps coral, rose and washed-out pinks', () => {
    expect(accentProblem('#ff8552')).toBeNull();
    expect(accentProblem('#ff8fc7')).toBeNull();
    expect(accentProblem('#ffc2c2')).toBeNull();
    expect(accentProblem('#ff4d00')).toBeNull(); // hue ~18°: orange, not red
  });

  it('refuses colours too dark to read on black', () => {
    expect(accentProblem('#1a1a6e')).toBe(TOO_DARK);
    expect(accentProblem('#333333')).toBe(TOO_DARK);
    expect(contrastOnBlack('#ffffff')).toBeCloseTo(21, 0);
    expect(accentProblem('#5aa9ff')).toBeNull();
  });

  it('round-trips through the sliders', () => {
    for (const hex of ['#7af0c3', '#5aa9ff', '#a3e635', '#ffffff']) {
      const { h, s, v } = hexToHsv(hex);
      expect(hsvToHex(h, s, v)).toBe(hex);
    }
  });

  it('applies a valid custom colour and falls back to the default for anything else', () => {
    applyAccent('#7af0c3');
    expect(colors.accent).toBe('#7af0c3');
    expect(accentName('#7af0c3')).toBe('CUSTOM');
    expect(isAccent('#7af0c3')).toBe(true);
    applyAccent('#ff0000');
    expect(colors.accent).toBe(DEFAULT_ACCENT);
    applyAccent('#7af0c3');
    applyAccent('not a colour');
    expect(colors.accent).toBe(DEFAULT_ACCENT);
    expect(isAccent('#111111')).toBe(false);
  });
});
