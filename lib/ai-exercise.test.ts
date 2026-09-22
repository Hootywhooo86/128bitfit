import { describe, expect, it } from 'vitest';
import { MUSCLE_GROUPS } from './muscle-load';
import { parseIdentifiedExercise, toMuscleGroup } from './ai-exercise';

const REPLY = JSON.stringify({
  name: 'Seated Cable Row',
  equipment: 'cable machine',
  primaryMuscles: ['lats', 'middle back'],
  secondaryMuscles: ['biceps', 'forearms'],
  instructions: ['Sit facing the stack.', 'Pull the handle to your waist.', 'Return under control.'],
  note: null,
});

describe('mapping muscle names onto the app groups', () => {
  it('accepts a group name as-is', () => {
    for (const g of MUSCLE_GROUPS) expect(toMuscleGroup(g)).toBe(g);
  });

  it('maps the names a model actually uses', () => {
    expect(toMuscleGroup('Pectoralis Major')).toBe('chest');
    expect(toMuscleGroup('pecs')).toBe('chest');
    expect(toMuscleGroup('Rear Delts')).toBe('shoulders');
    expect(toMuscleGroup('quads')).toBe('quadriceps');
    expect(toMuscleGroup('Latissimus Dorsi')).toBe('lats');
    expect(toMuscleGroup('gastrocnemius')).toBe('calves');
    expect(toMuscleGroup('erector spinae')).toBe('lower back');
    expect(toMuscleGroup('rhomboids')).toBe('middle back');
    expect(toMuscleGroup('obliques')).toBe('abdominals');
  });

  it('maps gluteus medius to abductors, not glutes', () => {
    // They are different groups on the map and colouring the wrong one is
    // worse than not colouring anything.
    expect(toMuscleGroup('gluteus maximus')).toBe('glutes');
    expect(toMuscleGroup('gluteus medius')).toBe('abductors');
  });

  it('reads a parenthetical', () => {
    expect(toMuscleGroup('Chest (pectorals)')).toBe('chest');
  });

  it('refuses a muscle this app has no group for', () => {
    // The map's coverage is closed and there is artwork for exactly 17 groups.
    expect(toMuscleGroup('rotator cuff')).toBeNull();
    expect(toMuscleGroup('serratus anterior')).toBeNull();
    expect(toMuscleGroup('')).toBeNull();
    expect(toMuscleGroup('   ')).toBeNull();
  });
});

describe('reading an identification', () => {
  const r = parseIdentifiedExercise(REPLY);

  it('takes the name, equipment and instructions', () => {
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.exercise.name).toBe('Seated Cable Row');
    expect(r.exercise.equipment).toBe('cable machine');
    expect(r.exercise.instructions).toHaveLength(3);
  });

  it('maps both muscle lists', () => {
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.exercise.primaryMuscles).toEqual(['lats', 'middle back']);
    expect(r.exercise.secondaryMuscles).toEqual(['biceps', 'forearms']);
  });

  it('never lets a muscle be both primary and secondary', () => {
    const both = parseIdentifiedExercise(
      JSON.stringify({ name: 'Curl', primaryMuscles: ['biceps'], secondaryMuscles: ['biceps', 'forearms'] })
    );
    if (both.status !== 'ok') throw new Error('expected ok');
    expect(both.exercise.primaryMuscles).toEqual(['biceps']);
    expect(both.exercise.secondaryMuscles).toEqual(['forearms']);
  });

  it('reports a muscle it could not map instead of dropping it silently', () => {
    const odd = parseIdentifiedExercise(
      JSON.stringify({ name: 'Face Pull', primaryMuscles: ['rear delts', 'rotator cuff'] })
    );
    if (odd.status !== 'ok') throw new Error('expected ok');
    expect(odd.exercise.primaryMuscles).toEqual(['shoulders']);
    expect(odd.exercise.unmapped).toEqual(['rotator cuff']);
  });

  it('de-duplicates', () => {
    const dup = parseIdentifiedExercise(
      JSON.stringify({ name: 'Press', primaryMuscles: ['chest', 'pecs', 'Pectoralis Major'] })
    );
    if (dup.status !== 'ok') throw new Error('expected ok');
    expect(dup.exercise.primaryMuscles).toEqual(['chest']);
  });

  it('strips a markdown fence', () => {
    expect(parseIdentifiedExercise('```json\n' + REPLY + '\n```').status).toBe('ok');
  });
});

describe('when it cannot tell', () => {
  it('reports the model saying so, rather than inventing a machine', () => {
    const r = parseIdentifiedExercise(
      JSON.stringify({ name: '', note: 'That is a locker, not a machine.' })
    );
    expect(r.status).toBe('empty');
    if (r.status !== 'empty') return;
    expect(r.message).toBe('That is a locker, not a machine.');
  });

  it('reports unreadable output and keeps the raw reply', () => {
    const r = parseIdentifiedExercise('I cannot help with that.');
    expect(r.status).toBe('unreadable');
    if (r.status !== 'unreadable') return;
    expect(r.raw).toContain('cannot help');
    expect(r.message).toMatch(/by hand/);
  });

  it('accepts an identification with no muscles rather than failing', () => {
    // A name and instructions are still worth having; the user fills the rest.
    const r = parseIdentifiedExercise(JSON.stringify({ name: 'Ab Roller' }));
    if (r.status !== 'ok') throw new Error('expected ok');
    expect(r.exercise.primaryMuscles).toEqual([]);
  });
});
