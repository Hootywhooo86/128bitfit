import { describe, expect, it } from 'vitest';
import { guessProductName } from './package-label';

/**
 * These use the shape OCR actually returns for a front-of-pack shot: the brand
 * mark, the name, a weight, and whatever marketing and legal text shares the
 * face of the box, all as flat lines in roughly reading order.
 */
describe('guessProductName', () => {
  it('picks the name out of a typical front of pack', () => {
    expect(
      guessProductName(
        [
          'KELLOGG’S',
          'Corn Flakes',
          'The Original & Best',
          'NET WT 500g',
        ].join('\n')
      )
    ).toBe('Corn Flakes');
  });

  it('ignores weights, volumes and bare numbers', () => {
    const name = guessProductName(
      ['500g', '1.5 L', '12 fl oz', '8901234567890', 'Greek Yoghurt'].join('\n')
    );
    expect(name).toBe('Greek Yoghurt');
  });

  it('ignores the legal and storage text that shares the pack', () => {
    const name = guessProductName(
      [
        'Roasted Almonds',
        'INGREDIENTS: almonds, sea salt, sunflower oil',
        'Contains: tree nuts',
        'Distributed by Acme Foods Ltd',
        'Best before: see cap',
        'Keep refrigerated after opening',
      ].join('\n')
    );
    expect(name).toBe('Roasted Almonds');
  });

  it('strips trademark marks rather than keeping them in the name', () => {
    expect(guessProductName('Choco Puffs®\nNET WT 12 oz')).toBe('Choco Puffs');
  });

  it('prefers a two-or-three word name over a lone brand word above it', () => {
    // OCR reads top to bottom, so the brand comes first. Earlier wins only
    // gently — a name-shaped line below it should still take precedence.
    expect(guessProductName('Barilla\nSpaghetti No 5')).toBe('Spaghetti No 5');
  });

  it('prefers a name-shaped line over a lone brand word further up', () => {
    // Placed far enough down that the top-to-bottom preference alone would
    // pick the brand: it is the two-to-five-word shape that decides it.
    expect(
      guessProductName(['Kelloggs', 'NET WT 500g', 'Family Size', 'Corn Flakes'].join('\n'))
    ).toBe('Corn Flakes');
  });

  it('ignores pack descriptors, which are as name-shaped as a real name', () => {
    // "Family Size" is two words, all letters and near the top — scoring alone
    // cannot tell it from "Corn Flakes", so it has to be named outright.
    for (const noise of [
      'Family Size',
      'Value Pack',
      'Share Size',
      'Limited Edition',
      '12 pack',
      'Gluten Free',
      'No added sugar',
    ]) {
      expect(guessProductName([noise, 'Corn Flakes'].join('\n'))).toBe('Corn Flakes');
    }
  });

  it('returns null rather than the least bad line', () => {
    // An empty field the user fills in beats a wrong one they have to notice.
    expect(guessProductName('500g\n1234567\n%%%')).toBeNull();
    expect(guessProductName('')).toBeNull();
    expect(guessProductName('   \n\n  ')).toBeNull();
  });

  it('rejects an ingredient run-on even when it is the only text', () => {
    expect(
      guessProductName(
        'water, sugar, glucose syrup, citric acid, natural flavouring, preservative'
      )
    ).toBeNull();
  });

  it('never returns a number, whatever else is in the photo', () => {
    const name = guessProductName('250\n0.5\n99 kcal\n12');
    expect(name).toBeNull();
  });
});
