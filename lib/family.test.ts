import { describe, expect, it } from 'vitest';
import { ACCENTS, accentProblem, appLink, FAMILY, PIXEL_FONT, shippedApps } from './family';
import { fonts } from './theme';

describe('128bit family kit', () => {
  it('links into a sibling by its real scheme', () => {
    expect(appLink('trip', 'passport')).toBe('bit128trip://passport');
    expect(appLink('play', '/books')).toBe('bit128://books');
    expect(appLink('fit')).toBe('bitfit://');
  });

  it('has no link for an app that has not shipped', () => {
    expect(appLink('life')).toBeNull();
    expect(shippedApps().map((a) => a.id)).toEqual(['fit', 'play', 'trip']);
  });

  it('every shipped app has an Android package', () => {
    for (const a of Object.values(FAMILY)) expect(a.scheme == null).toBe(a.androidPackage == null);
  });

  it('fit uses the family pixel face', () => {
    expect(fonts.pixel).toBe(PIXEL_FONT);
  });

  it('no preset breaks the accent rules', () => {
    for (const a of ACCENTS) expect(accentProblem(a.hex)).toBeNull();
  });
});
