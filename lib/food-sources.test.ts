import { describe, expect, it } from 'vitest';
import {
  CACHED_FOOD_SOURCES,
  PRESERVED_FOOD_SOURCES,
  USER_FOOD_SOURCES,
} from './food-sources';

describe('what the bundled re-import is allowed to delete', () => {
  it('preserves every source the user can create', () => {
    for (const source of USER_FOOD_SOURCES) {
      expect(PRESERVED_FOOD_SOURCES).toContain(source);
    }
  });

  it('preserves the barcode cache too', () => {
    for (const source of CACHED_FOOD_SOURCES) {
      expect(PRESERVED_FOOD_SOURCES).toContain(source);
    }
  });

  it('keeps recipes apart from custom foods, because they are logged differently', () => {
    expect(USER_FOOD_SOURCES).toContain('recipe');
    expect(USER_FOOD_SOURCES).toContain('custom');
  });

  it('does not preserve a bundled source, or the re-import would never refresh', () => {
    for (const bundled of ['foundation', 'sr_legacy', 'survey', 'branded']) {
      expect(PRESERVED_FOOD_SOURCES).not.toContain(bundled);
    }
  });
});
