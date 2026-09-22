import { describe, expect, it } from 'vitest';
import { fieldsToFill, isEmptyJsonArray } from './merge';

/**
 * The rule these cover: an import adds, it never overwrites. Getting this wrong
 * means a backup's hand-tagged muscles quietly replacing the curated library,
 * which the user would only notice as the muscle map going wrong.
 */
const incoming = {
  primaryMuscles: ['chest'],
  secondaryMuscles: ['triceps'],
  instructions: ['Press it.'],
};

describe('isEmptyJsonArray', () => {
  it('treats nothing, an empty array and unreadable JSON as empty', () => {
    expect(isEmptyJsonArray(null)).toBe(true);
    expect(isEmptyJsonArray('')).toBe(true);
    expect(isEmptyJsonArray('[]')).toBe(true);
    // A column we cannot parse is not a curated value worth protecting.
    expect(isEmptyJsonArray('not json')).toBe(true);
    expect(isEmptyJsonArray('{"a":1}')).toBe(true);
  });

  it('treats a populated array as not empty', () => {
    expect(isEmptyJsonArray('["chest"]')).toBe(false);
  });
});

describe('fieldsToFill', () => {
  it('fills in every blank column', () => {
    expect(
      fieldsToFill({ primaryMuscles: '[]', secondaryMuscles: '[]', instructions: '[]' }, incoming)
    ).toEqual({
      primaryMuscles: '["chest"]',
      secondaryMuscles: '["triceps"]',
      instructions: '["Press it."]',
    });
  });

  it('leaves a column that already has something alone', () => {
    const patch = fieldsToFill(
      {
        primaryMuscles: '["lats"]',
        secondaryMuscles: '[]',
        instructions: '["Pull it."]',
      },
      incoming
    );
    // Only the blank one is touched. The library's own tagging stands.
    expect(patch).toEqual({ secondaryMuscles: '["triceps"]' });
  });

  it('changes nothing when the backup has nothing to add', () => {
    const patch = fieldsToFill(
      { primaryMuscles: '[]', secondaryMuscles: '[]', instructions: '[]' },
      { primaryMuscles: [], secondaryMuscles: [], instructions: [] }
    );
    // An empty patch, not three empty arrays written over three empty columns.
    expect(patch).toEqual({});
  });

  it('changes nothing when every column is already populated', () => {
    expect(
      fieldsToFill(
        {
          primaryMuscles: '["lats"]',
          secondaryMuscles: '["biceps"]',
          instructions: '["Pull it."]',
        },
        incoming
      )
    ).toEqual({});
  });
});
