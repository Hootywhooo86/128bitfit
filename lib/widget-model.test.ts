import { describe, expect, it } from 'vitest';
import { emptyTally } from './muscle-load';
import { muscleHeat } from './theme';
import { muscleGridSvg, ringSvg, setLine, todayModel, trainedCount, workoutModel, type WidgetExercise } from './widget-model';

const base = {
  calorieTarget: 2400,
  proteinTarget: 180,
  calories: 0,
  protein: 0,
  proteinPartial: false,
  logCount: 0,
  burned: { status: 'not_connected' as const },
};

describe('TODAY widget', () => {
  it('nothing logged is the target, unfilled — not a filled 0', () => {
    const m = todayModel(base);
    expect(m.nothingLogged).toBe(true);
    expect(m.fill).toBe(0);
    expect(m.calorieLine).toBe('2400 kcal to eat');
    expect(m.calorieLine).not.toMatch(/^0/);
  });

  it('shows eaten, left and protein to go', () => {
    const m = todayModel({ ...base, calories: 1200, protein: 100, logCount: 3 });
    expect(m.fill).toBeCloseTo(0.5);
    expect(m.calorieLine).toBe('1200 of 2400 · 1200 left');
    expect(m.proteinLine).toBe('Protein 80 g to go');
  });

  it('over target says so, and the ring stops at full', () => {
    const m = todayModel({ ...base, calories: 2600, protein: 200, logCount: 5 });
    expect(m.over).toBe(true);
    expect(m.fill).toBe(1);
    expect(m.calorieLine).toBe('2600 of 2400 · 200 over');
    expect(m.proteinLine).toBe('Protein target hit');
  });

  it('protein with unknowns is a ceiling, not a figure', () => {
    expect(todayModel({ ...base, calories: 500, protein: 30, logCount: 2, proteinPartial: true }).proteinLine).toBe(
      'Protein up to 150 g to go'
    );
  });

  it('burned: a reading, a dash when not connected, never a made-up 0', () => {
    const now = Date.UTC(2026, 9, 4, 18);
    expect(todayModel({ ...base, burned: { status: 'reading', kcal: 412.4, at: now }, now }).burnedLine).toBe('412 kcal burned');
    expect(todayModel(base).burnedLine).toBe('Burned — not connected');
    expect(todayModel({ ...base, burned: { status: 'unavailable' } }).burnedLine).toMatch(/not on this phone/);
    const stale = todayModel({ ...base, burned: { status: 'reading', kcal: 300, at: now - 2 * 3600_000 }, now });
    expect(stale.burnedLine).toMatch(/^300 kcal burned · at /);
  });

  it('draws the ring with the accent, and no arc at all when empty', () => {
    expect(ringSvg(0.5, '#4be0c8')).toContain('stroke="#4be0c8"');
    expect(ringSvg(0, '#4be0c8')).not.toContain('#4be0c8');
  });
});

const ex = (over: Partial<WidgetExercise> = {}): WidgetExercise => ({
  id: 'se1',
  name: 'Bench press',
  track: 'reps',
  restSeconds: 120,
  sets: [
    { id: 's1', completed: true, isWarmup: false, reps: 5, weight: 185, weightUnit: 'lb', distanceM: null },
    { id: 's2', completed: false, isWarmup: false, reps: 5, weight: 185, weightUnit: 'lb', distanceM: null },
    { id: 's3', completed: false, isWarmup: false, reps: 5, weight: 185, weightUnit: 'lb', distanceM: null },
  ],
  ...over,
});

describe('WORKOUT IN PROGRESS widget', () => {
  it('no session: says so', () => {
    expect(workoutModel(null, [], null)).toEqual({ state: 'none' });
  });

  it('the next unfinished set, pre-filled, ready to log', () => {
    const m = workoutModel({ id: 'w1' }, [ex()], null);
    expect(m).toMatchObject({
      state: 'next',
      setId: 's2',
      exerciseName: 'Bench press',
      setLabel: 'Set 2 of 3',
      line: '185 × 5 lb',
      canLogFromWidget: true,
      restSeconds: 120,
    });
  });

  it('moves on to the next exercise when one is finished', () => {
    const done = ex({ sets: ex().sets.map((s) => ({ ...s, completed: true })) });
    const squat = ex({ id: 'se2', name: 'Squat', sets: [{ ...ex().sets[1], id: 'q1', weight: 225 }] });
    expect(workoutModel({ id: 'w1' }, [done, squat], null)).toMatchObject({ setId: 'q1', exerciseName: 'Squat', line: '225 × 5 lb' });
  });

  it('a set with nothing filled in is not logged blind from the widget', () => {
    const empty = ex({ sets: [{ id: 'e1', completed: false, isWarmup: false, reps: null, weight: null, weightUnit: 'lb', distanceM: null }] });
    expect(workoutModel({ id: 'w1' }, [empty], null)).toMatchObject({ canLogFromWidget: false });
  });

  it('carries and distance sets read as load and metres', () => {
    expect(setLine({ id: 'x', completed: false, isWarmup: false, reps: null, weight: 100, weightUnit: 'lb', distanceM: 40 }, 'distance')).toBe(
      '100 lb · 40 m'
    );
  });

  it('everything done, and rest only while it is still running', () => {
    const done = ex({ sets: ex().sets.map((s) => ({ ...s, completed: true })) });
    const now = 1_000_000;
    expect(workoutModel({ id: 'w1' }, [done], now + 60_000, now)).toEqual({ state: 'all_done', sessionId: 'w1', restUntil: now + 60_000 });
    expect(workoutModel({ id: 'w1' }, [ex()], now - 1, now)).toMatchObject({ restUntil: null });
  });
});

describe('MUSCLE MAP widget', () => {
  it('grey when untouched, heat colours by set count, never the accent', () => {
    const tally = { ...emptyTally(), chest: 2, quadriceps: 5, lats: 9 };
    const svg = muscleGridSvg(tally);
    expect(svg).toContain(muscleHeat.none);
    expect(svg).toContain(muscleHeat.light);
    expect(svg).toContain(muscleHeat.medium);
    expect(svg).toContain(muscleHeat.heavy);
    expect(trainedCount(tally)).toBe(3);
    expect(trainedCount(emptyTally())).toBe(0);
  });
});
