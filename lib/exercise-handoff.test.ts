import { beforeEach, describe, expect, it } from 'vitest';
import { clearNewExercise, stageNewExercise, takeNewExercise } from './exercise-handoff';

beforeEach(() => clearNewExercise());

describe('handing a new exercise back to the routine builder', () => {
  it('delivers what was staged', () => {
    stageNewExercise('ex_abc');
    expect(takeNewExercise()).toBe('ex_abc');
  });

  it('delivers it once, so a second focus does not add the exercise twice', () => {
    stageNewExercise('ex_abc');
    expect(takeNewExercise()).toBe('ex_abc');
    expect(takeNewExercise()).toBeNull();
  });

  it('has nothing to give when nothing was staged', () => {
    expect(takeNewExercise()).toBeNull();
  });

  it('keeps the most recent, not the first', () => {
    stageNewExercise('ex_one');
    stageNewExercise('ex_two');
    expect(takeNewExercise()).toBe('ex_two');
  });

  it('treats a blank id as nothing, rather than staging an empty string', () => {
    stageNewExercise('   ');
    expect(takeNewExercise()).toBeNull();
  });

  it('can be abandoned by a screen that leaves without collecting', () => {
    stageNewExercise('ex_abc');
    clearNewExercise();
    expect(takeNewExercise()).toBeNull();
  });
});
