import { afterEach, describe, expect, it } from 'vitest';
import { ACCENTS, DEFAULT_ACCENT, applyAccent, onAccentFor } from './accent';
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
