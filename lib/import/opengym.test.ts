import { describe, expect, it } from 'vitest';
import backup from './__fixtures__/opengym.json';
import { isOpenGymBackup, parseOpenGym } from './opengym';

/**
 * The fixture is a slice of a real openGym backup, trimmed to its shape. The
 * generic set parser reported "no sets found" for the real file, which is what
 * these exist to stop happening again.
 */
describe('recognising the format', () => {
  it('spots an openGym backup', () => {
    expect(isOpenGymBackup(backup)).toBe(true);
  });

  it('does not claim a plain set list or a nested export', () => {
    expect(isOpenGymBackup([{ exerciseName: 'Row', date: '2025-01-01' }])).toBe(false);
    expect(isOpenGymBackup({ workouts: [{ name: 'x', exercises: [] }] })).toBe(false);
    expect(isOpenGymBackup(null)).toBe(false);
    expect(isOpenGymBackup({})).toBe(false);
  });
});

describe('reading it', () => {
  const r = parseOpenGym(backup);

  it('imports the completed sets', () => {
    if ('error' in r) throw new Error(r.error);
    // Two from the first exercise, one custom, one from the second workout.
    expect(r.sets).toHaveLength(4);
  });

  it('skips a set the user never performed', () => {
    // openGym keeps planned sets with done:false. Importing them would invent
    // training that did not happen.
    if ('error' in r) throw new Error(r.error);
    expect(r.sets.filter((s) => s.exerciseName === 'bayesin cable curl')).toHaveLength(1);
  });

  it('names a custom exercise from customEx', () => {
    if ('error' in r) throw new Error(r.error);
    expect(r.sets.map((s) => s.exerciseName)).toContain('bayesin cable curl');
  });

  it('keeps the id as a placeholder for an exercise the backup cannot name', () => {
    // The built-in catalogue is not in the file. Losing the dates, weights and
    // reps over a missing label would be the worse trade.
    if ('error' in r) throw new Error(r.error);
    expect(r.sets.map((s) => s.exerciseName)).toContain('openGym 0218');
    expect(r.openGym?.namedCount).toBe(8);
    // Counts ids from the routines too, because those come in numbered as
    // well and the screen's warning is about all of them.
    expect(r.openGym?.unnamedIds).toContain('0218');
    expect(r.openGym?.unnamedIds).toContain('0811');
    expect(r.openGym?.unnamedIds).not.toContain('immtgdwimsz93dd');
  });

  it('takes the unit from the top-level setting, not per set', () => {
    if ('error' in r) throw new Error(r.error);
    expect(r.sets.every((s) => s.weightUnit === 'lb')).toBe(true);
  });

  it('reads the date from `d`, or from the epoch start when there is none', () => {
    if ('error' in r) throw new Error(r.error);
    expect(r.sets[0].date).toBe('2024-06-24');
    // The second workout has only `start`.
    expect(r.sets.find((s) => s.workoutName === 'Legs')?.date).toMatch(/^2024-06-/);
  });

  it('carries the workout name through', () => {
    if ('error' in r) throw new Error(r.error);
    expect(r.sets[0].workoutName).toBe('2. Back and Biceps');
  });

  it('numbers sets within their exercise', () => {
    if ('error' in r) throw new Error(r.error);
    const first = r.sets.filter((s) => s.exerciseName === 'openGym 0218');
    expect(first.map((s) => s.setIndex)).toEqual([1, 2]);
  });

  it('reports a workout with no exercises rather than dropping it silently', () => {
    if ('error' in r) throw new Error(r.error);
    expect(r.skipped).toEqual([{ row: 3, reason: 'no exercises' }]);
  });

  it('refuses a backup with nothing completed in it', () => {
    const empty = parseOpenGym({ unit: 'kg', workouts: [{ d: '2025-01-01', entries: [] }] });
    expect('error' in empty).toBe(true);
  });
});

/**
 * The parts of a backup that are not training that happened.
 *
 * These were all dropped on the floor while the import reported success: the
 * real file carries thirteen routines, thirty-one custom exercises and a year
 * of weigh-ins, and only the set history was read.
 */
describe('routines', () => {
  const r = parseOpenGym(backup);
  const extras = 'error' in r ? null : r.extras;

  it('reads them', () => {
    expect(extras?.routines.map((x) => x.name)).toEqual([
      'Day 2',
      'Full Body Big Lift Day A',
      'Shapes',
    ]);
  });

  it('keeps sets, reps and rest as targets', () => {
    const day2 = extras?.routines.find((x) => x.name === 'Day 2');
    expect(day2?.exercises[0]).toMatchObject({ targetSets: 4, targetReps: 8 });
    const withRest = extras?.routines
      .flatMap((x) => x.exercises)
      .find((e) => e.restSeconds != null);
    expect(withRest?.restSeconds).toBe(60);
  });

  it('resolves exercise names the same way the history does', () => {
    const day2 = extras?.routines.find((x) => x.name === 'Day 2');
    const names = day2?.exercises.map((e) => e.exerciseName) ?? [];
    // A custom one by name, a catalogue one by its numbered placeholder — so a
    // routine points at the same exercise rows the imported sessions do.
    expect(names).toContain('iso-lateral low row');
    expect(names).toContain('openGym 0811');
  });

  it('does not invent a rep target for a timed or cardio entry', () => {
    const cardio = extras?.routines
      .flatMap((x) => x.exercises)
      .find((e) => e.notes?.includes('min'));
    expect(cardio?.targetReps).toBeNull();
    expect(cardio?.notes).toContain('20 min');
    expect(cardio?.notes).toContain('speed 0.2');

    const timed = extras?.routines.flatMap((x) => x.exercises).find((e) => e.notes?.includes('sec'));
    expect(timed?.targetReps).toBeNull();
    expect(timed?.notes).toContain('45 sec');
  });

  it('keeps what the schema has no column for in the note', () => {
    const all = extras?.routines.flatMap((x) => x.exercises) ?? [];
    expect(all.find((e) => e.notes?.includes('400 lb target'))).toBeTruthy();
    expect(all.find((e) => e.notes?.includes('per session'))).toBeTruthy();
    // The user's own note survives alongside the generated part.
    const noted = all.find((e) => e.notes?.includes('7 outside 7 middle 7 inside'));
    expect(noted?.notes).toContain('45 lb target');
  });

  it('does not record a target of zero as a weight', () => {
    // A bodyweight exercise carries weight 0, which is not a target of nothing.
    const all = extras?.routines.flatMap((x) => x.exercises) ?? [];
    const targets = all
      .flatMap((e) => (e.notes ?? '').split(/[·\n]/))
      .map((part) => part.trim())
      .filter((part) => part.endsWith('target'));
    expect(targets.length).toBeGreaterThan(0);
    expect(targets).not.toContain('0 lb target');
  });
});

describe('custom exercises', () => {
  const r = parseOpenGym(backup);
  const extras = 'error' in r ? null : r.extras;

  it('maps openGym muscle names onto this app groups', () => {
    const curl = extras?.exercises.find((e) => e.name === 'bayesin cable curl');
    expect(curl?.primaryMuscles).toEqual(['biceps']);
    // "forearm" and "abs" are openGym's spelling of forearms and abdominals.
    expect(curl?.secondaryMuscles).toEqual(['forearms', 'abdominals']);
  });

  it('keeps the body part as a label, never as a muscle', () => {
    const curl = extras?.exercises.find((e) => e.name === 'bayesin cable curl');
    expect(curl?.category).toBe('upper arms');

    // The trap is the body parts that are *also* muscle group names. "chest"
    // as a region says where the machine is pointed, not what it worked, and
    // reading it as a muscle would colour the map from a guess.
    const one = parseOpenGym({
      ...backup,
      customEx: [{ id: 'x1', n: 'mystery press', eq: 'custom', bp: 'chest', tg: 'triceps' }],
    });
    if ('error' in one) throw new Error(one.error);
    const ex = one.extras!.exercises[0];
    expect(ex.category).toBe('chest');
    expect(ex.primaryMuscles).toEqual(['triceps']);
    expect(ex.secondaryMuscles).toEqual([]);
  });

  it('never puts one muscle in both lists', () => {
    // openGym lets the same muscle be tagged twice. Primary wins — the same
    // rule the AI identifier follows, so an exercise reads the same however it
    // arrived.
    const both = parseOpenGym({
      ...backup,
      customEx: [
        {
          id: 'x1',
          n: 'double tagged',
          eq: 'custom',
          primaries: ['biceps', 'forearm'],
          secondaries: ['forearm', 'abs'],
        },
      ],
    });
    if ('error' in both) throw new Error(both.error);
    const ex = both.extras!.exercises[0];
    expect(ex.primaryMuscles).toEqual(['biceps', 'forearms']);
    expect(ex.secondaryMuscles).toEqual(['abdominals']);
  });

  it('does not record "custom" as a kind of equipment', () => {
    const curl = extras?.exercises.find((e) => e.name === 'bayesin cable curl');
    expect(curl?.equipment).toBeNull();
  });

  it('counts the ones with no muscles recorded rather than guessing them', () => {
    if ('error' in r) throw new Error(r.error);
    // Two of the fixture's eight recorded no muscles at all.
    expect(r.openGym?.exercisesWithoutMuscles).toBe(2);
    const bare = parseOpenGym({
      ...backup,
      customEx: [{ id: 'x1', n: 'mystery machine', eq: 'custom', tg: '', bp: 'back' }],
    });
    if ('error' in bare) throw new Error(bare.error);
    expect(bare.openGym?.exercisesWithoutMuscles).toBe(1);
    expect(bare.extras?.exercises[0].primaryMuscles).toEqual([]);
    expect(bare.extras?.exercises[0].secondaryMuscles).toEqual([]);
  });
});

describe('weigh-ins', () => {
  const r = parseOpenGym(backup);
  const extras = 'error' in r ? null : r.extras;

  it('reads them in the backup unit', () => {
    expect(extras?.weights).toHaveLength(3);
    expect(extras?.weights[0]).toEqual({
      date: '2025-09-07',
      at: 1757427286585,
      value: 288,
      unit: 'lb',
    });
  });

  it('drops a reading that is not a weight', () => {
    const bad = parseOpenGym({
      ...backup,
      bodyweight: [
        { d: '2025-01-01', w: 0, t: 1 },
        { d: '2025-01-02', w: -5, t: 2 },
        { d: '2025-01-03', w: 'heavy', t: 3 },
        { d: '2025-01-04', w: 180, t: 4 },
      ],
    });
    if ('error' in bad) throw new Error(bad.error);
    expect(bad.extras?.weights).toEqual([
      { date: '2025-01-04', at: 4, value: 180, unit: 'lb' },
    ]);
  });
});

describe('a backup with no sets', () => {
  it('still imports the routines and weigh-ins it does have', () => {
    // Refusing the whole file because nothing was logged yet would throw away
    // the plans and the weigh-ins the user does have.
    const planOnly = parseOpenGym({ ...backup, workouts: [{ d: '2025-01-01', entries: [] }] });
    if ('error' in planOnly) throw new Error(planOnly.error);
    expect(planOnly.sets).toHaveLength(0);
    expect(planOnly.extras?.routines.length).toBeGreaterThan(0);
    expect(planOnly.extras?.weights.length).toBeGreaterThan(0);
  });

  it('refuses a backup with nothing in it at all', () => {
    const nothing = parseOpenGym({
      unit: 'lb',
      workouts: [{ d: '2025-01-01', entries: [] }],
      routines: [],
      customEx: [],
      bodyweight: [],
    });
    expect('error' in nothing).toBe(true);
  });
});
