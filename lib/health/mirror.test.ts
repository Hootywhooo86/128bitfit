import { beforeEach, describe, expect, it, vi } from 'vitest';

// The real module reaches react-native through ./index, which cannot load here
// and is not what is under test: this checks the mirror's own contract, which
// is that a push never reaches the caller and a failure is never swallowed.
const pushMeals = vi.fn();
const pushWater = vi.fn();
const pushWeight = vi.fn();
const pushWeights = vi.fn();
const pushWorkout = vi.fn();
const removeMeals = vi.fn();
const removeWaters = vi.fn();
const removeWeights = vi.fn();
const removeWorkouts = vi.fn();

vi.mock('./sync', () => ({
  pushMeals,
  pushWater,
  pushWeight,
  pushWeights,
  pushWorkout,
  removeMeals,
  removeWaters,
  removeWeights,
  removeWorkouts,
}));

const {
  clearMirrorFailure,
  lastMirrorFailure,
  mirrorMeal,
  mirrorMealRemoved,
  mirrorWater,
  mirrorWeight,
  mirrorWeights,
  mirrorWorkout,
  subscribeMirror,
} = await import('./mirror');

const ok = { written: 1, error: null };
const meal = {
  id: 'fl_1',
  loggedAt: 1,
  name: 'Eggs',
  mealType: 'breakfast' as const,
  calories: 200,
  protein: 18,
  fat: 14,
  carb: 1,
};

/** Let the fire-and-forget promise chain settle. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  clearMirrorFailure();
  for (const fn of [pushMeals, pushWater, pushWeight, pushWeights, pushWorkout, removeMeals, removeWaters, removeWeights, removeWorkouts]) {
    fn.mockReset();
    fn.mockResolvedValue(ok);
  }
});

describe('mirroring a local write', () => {
  it('passes the local row id through as the client id', async () => {
    mirrorWeight('we_7', 1234, 80);
    await settle();
    expect(pushWeight).toHaveBeenCalledWith(1234, 80, 'we_7');

    mirrorWater('wl_3', 99, 250);
    await settle();
    expect(pushWater).toHaveBeenCalledWith(99, 250, 'wl_3');
  });

  it('sends an imported history as one batch, and skips an empty one', async () => {
    const batch = [
      { id: 'we_1', at: 1, kg: 80 },
      { id: 'we_2', at: 2, kg: 79 },
    ];
    mirrorWeights(batch);
    await settle();
    expect(pushWeights).toHaveBeenCalledTimes(1);
    expect(pushWeights).toHaveBeenCalledWith(batch);

    mirrorWeights([]);
    await settle();
    expect(pushWeights).toHaveBeenCalledTimes(1);
  });

  it('records nothing when the push succeeds', async () => {
    mirrorMeal(meal);
    await settle();
    expect(pushMeals).toHaveBeenCalledWith([meal]);
    expect(lastMirrorFailure()).toBeNull();
  });

  it('treats a skipped push as success, not failure', async () => {
    // "Not granted" comes back as zero written with no error. That is the
    // user's choice and must not be reported at them.
    pushMeals.mockResolvedValue({ written: 0, error: null });
    mirrorMeal(meal);
    await settle();
    expect(lastMirrorFailure()).toBeNull();
  });
});

describe('when Health Connect will not take it', () => {
  it('keeps the provider sentence so the UI can show it', async () => {
    pushMeals.mockResolvedValue({ written: 0, error: 'No permission to write nutrition.' });
    mirrorMeal(meal);
    await settle();
    expect(lastMirrorFailure()).toMatchObject({
      what: 'your food log',
      message: 'No permission to write nutrition.',
    });
  });

  it('does not let a rejected push escape to the caller', async () => {
    pushWorkout.mockRejectedValue(new Error('binder died'));
    // An unhandled rejection here would crash a release build over a workout
    // that is already saved.
    expect(() => mirrorWorkout({ id: 's1', startedAt: 1, endedAt: 2 })).not.toThrow();
    await settle();
    expect(lastMirrorFailure()?.message).toBe('binder died');
  });

  it('tells subscribers, and tells them again when it is cleared', async () => {
    const seen: (string | null)[] = [];
    const stop = subscribeMirror((f) => seen.push(f?.message ?? null));
    removeMeals.mockResolvedValue({ written: 0, error: 'gone wrong' });
    mirrorMealRemoved('fl_1');
    await settle();
    clearMirrorFailure();
    stop();
    expect(seen).toEqual(['gone wrong', null]);

    // Unsubscribed listeners stop hearing about it.
    pushMeals.mockResolvedValue({ written: 0, error: 'later' });
    mirrorMeal(meal);
    await settle();
    expect(seen).toEqual(['gone wrong', null]);
  });
});
