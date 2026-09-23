import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PRESERVED_EXERCISE_CATEGORIES,
  USER_EXERCISE_CATEGORIES,
  isUserExercise,
} from './exercise-sources';

describe('what the bundled re-import is allowed to delete', () => {
  it('preserves every category the user can end up owning', () => {
    for (const category of USER_EXERCISE_CATEGORIES) {
      expect(PRESERVED_EXERCISE_CATEGORIES).toContain(category);
    }
  });

  it('does not overlap the shipped catalogue, or the re-import would never refresh', () => {
    const bundled = JSON.parse(
      readFileSync(resolve(process.cwd(), 'assets/data/exercises.json'), 'utf8')
    ) as { category?: string | null }[];
    expect(bundled.length).toBeGreaterThan(0);
    const categories = new Set(bundled.map((e) => e.category ?? ''));
    for (const preserved of PRESERVED_EXERCISE_CATEGORIES) {
      expect(categories).not.toContain(preserved);
    }
  });

  it('counts a custom and an imported exercise as the user, and bundled ones as not', () => {
    expect(isUserExercise('custom')).toBe(true);
    expect(isUserExercise('imported')).toBe(true);
    expect(isUserExercise('strength')).toBe(false);
    expect(isUserExercise('cardio')).toBe(false);
  });

  it('treats a missing category as bundled, since only user rows are written with one', () => {
    expect(isUserExercise(null)).toBe(false);
    expect(isUserExercise(undefined)).toBe(false);
    expect(isUserExercise('')).toBe(false);
  });
});
