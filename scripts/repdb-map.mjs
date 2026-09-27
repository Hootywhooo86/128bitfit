/**
 * RepDB → the app's exercise shape.
 *
 * The app's vocabulary is free-exercise-db's: its muscle names are what the
 * muscle map draws, and its equipment names are what the library filters on.
 * RepDB is more anatomical (gluteus_medius, soleus, …), so every value is
 * mapped explicitly here. A value with no entry fails the build rather than
 * being dropped, so a new RepDB release cannot quietly leave exercises
 * untagged on the map.
 *
 * Plain JS so the Node build script and the vitest suite share one table.
 */

/** RepDB muscle → the muscle-map region it belongs to. */
export const MUSCLES = {
  rectus_abdominis: 'abdominals',
  transverse_abdominis: 'abdominals',
  obliques: 'abdominals',
  // Rectus femoris is both a quad and the main hip flexor; the quad region is
  // the closest the map has.
  hip_flexors: 'quadriceps',
  quadriceps: 'quadriceps',
  hamstrings: 'hamstrings',
  gluteus_maximus: 'glutes',
  gluteus_medius: 'glutes',
  adductors: 'adductors',
  abductors: 'abductors',
  gastrocnemius: 'calves',
  soleus: 'calves',
  pectoralis_major: 'chest',
  serratus_anterior: 'chest',
  latissimus_dorsi: 'lats',
  rhomboids: 'middle back',
  trapezius: 'traps',
  erector_spinae: 'lower back',
  quadratus_lumborum: 'lower back',
  anterior_deltoid: 'shoulders',
  lateral_deltoid: 'shoulders',
  posterior_deltoid: 'shoulders',
  supraspinatus: 'shoulders',
  biceps_brachii: 'biceps',
  brachialis: 'biceps',
  triceps_brachii: 'triceps',
  brachioradialis: 'forearms',
  forearm_flexors: 'forearms',
  forearm_extensors: 'forearms',
  forearms: 'forearms',
};

const MACHINE = 'machine';
const BODY = 'body only';

/**
 * RepDB equipment → the library's equipment filter.
 *
 * A pull-up bar, rings, dip station or suspension trainer is "body only", as
 * free-exercise-db already files pull-ups: the load is the body, and these are
 * exactly what a home or calisthenics trainee is filtering for.
 */
export const EQUIPMENT = {
  none: BODY,
  pull_up_bar: BODY,
  rings: BODY,
  dip_station: BODY,
  suspension_trainer: BODY,
  barbell: 'barbell',
  trap_bar: 'barbell',
  plates: 'other',
  ez_bar: 'e-z curl bar',
  dumbbell: 'dumbbell',
  kettlebell: 'kettlebells',
  cable: 'cable',
  loop_band: 'bands',
  resistance_band: 'bands',
  stability_ball: 'exercise ball',
  slam_ball: 'medicine ball',
  flat_bench: 'other',
  ab_wheel: 'other',
  battle_rope: 'other',
  climbing_rope: 'other',
  jump_rope: 'other',
  plyo_box: 'other',
  sled: 'other',
  wrist_roller: 'other',
  ab_crunch_machine: MACHINE,
  air_bike: MACHINE,
  assisted_pullup_machine: MACHINE,
  back_extension_machine: MACHINE,
  bicep_curl_machine: MACHINE,
  chest_fly_machine: MACHINE,
  chest_press_machine: MACHINE,
  dip_machine: MACHINE,
  donkey_calf_raise_machine: MACHINE,
  elliptical: MACHINE,
  glute_ham_developer: MACHINE,
  hack_squat: MACHINE,
  hip_abduction_machine: MACHINE,
  hip_adduction_machine: MACHINE,
  hip_thrust_machine: MACHINE,
  lat_pulldown_machine: MACHINE,
  leg_curl: MACHINE,
  leg_extension: MACHINE,
  leg_press: MACHINE,
  pec_deck: MACHINE,
  plate_loaded_lateral_raise_machine: MACHINE,
  preacher_curl_machine: MACHINE,
  rower: MACHINE,
  seated_calf_raise_machine: MACHINE,
  shoulder_press_machine: MACHINE,
  shrug_machine: MACHINE,
  smith_machine: MACHINE,
  stair_climber: MACHINE,
  standing_calf_raise_machine: MACHINE,
  stationary_bike: MACHINE,
  treadmill: MACHINE,
  tricep_extension_machine: MACHINE,
};

export const CATEGORIES = {
  strength: 'strength',
  stretching: 'stretching',
  cardio: 'cardio',
  plyometrics: 'plyometrics',
  olympic: 'olympic weightlifting',
};

export const LEVELS = { beginner: 'beginner', intermediate: 'intermediate', advanced: 'expert' };

/** free-exercise-db has push/pull/static; "dynamic" has no counterpart and stays unset. */
export const FORCES = { push: 'push', pull: 'pull', static: 'static', dynamic: null };

export const ID_PREFIX = 'repdb:';

/** For matching names across the two catalogues: "Push Ups" and "Pushups" are one exercise. */
export function normName(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mapMuscles(list, unmapped) {
  const out = [];
  for (const m of list ?? []) {
    const region = MUSCLES[m];
    if (region === undefined) {
      unmapped.add(`muscle:${m}`);
      continue;
    }
    if (!out.includes(region)) out.push(region);
  }
  return out;
}

function lookup(table, kind, value, unmapped) {
  if (value == null) return null;
  if (!(value in table)) {
    unmapped.add(`${kind}:${value}`);
    return null;
  }
  return table[value];
}

/**
 * RepDB rows → app exercise rows, skipping any the app already has by name.
 *
 * @param rows RepDB `exercises` array.
 * @param existingNames Names already in the bundled catalogue.
 * @param imageKeys Image keys the build produced, e.g. "ab-wheel-rollout-start".
 */
export function mapRepdb(rows, existingNames, imageKeys = new Set()) {
  const have = new Set([...existingNames].map(normName));
  const unmapped = new Set();
  const exercises = [];
  const duplicates = [];

  for (const r of rows) {
    const name = r.name_en?.trim();
    if (!r.id || !name) continue;
    if (have.has(normName(name))) {
      duplicates.push(name);
      continue;
    }
    have.add(normName(name));

    const primary = mapMuscles(r.primary_muscles, unmapped);
    const secondary = mapMuscles(r.secondary_muscles, unmapped).filter((m) => !primary.includes(m));
    const images = ['start', 'peak']
      .map((pose) => `${r.id}-${pose}`)
      .filter((key) => imageKeys.has(key))
      .map((key) => `repdb/${key}`);

    exercises.push({
      id: `${ID_PREFIX}${r.id}`,
      name,
      force: lookup(FORCES, 'force', r.force_type, unmapped),
      level: lookup(LEVELS, 'level', r.difficulty, unmapped),
      mechanic: r.mechanic ?? null,
      equipment: lookup(EQUIPMENT, 'equipment', r.equipment ?? 'none', unmapped),
      primaryMuscles: primary,
      secondaryMuscles: secondary,
      instructions: [...(r.instructions_en ?? []), ...(r.tips_en ?? []).map((t) => `Tip: ${t}`)],
      category: lookup(CATEGORIES, 'category', r.category, unmapped),
      images,
    });
  }

  return { exercises, duplicates, unmapped: [...unmapped].sort() };
}
