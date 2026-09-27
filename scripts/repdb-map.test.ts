import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { USER_EXERCISE_CATEGORIES } from '@/lib/exercise-sources';
import { CATEGORIES, EQUIPMENT, FORCES, LEVELS, MUSCLES, mapRepdb, normName } from './repdb-map.mjs';

type Bundled = {
  name: string;
  equipment: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  category: string | null;
  level: string | null;
};
const bundled = JSON.parse(fs.readFileSync('assets/data/exercises.json', 'utf8')) as Bundled[];
const ours = {
  muscles: new Set(bundled.flatMap((e) => [...e.primaryMuscles, ...e.secondaryMuscles])),
  equipment: new Set(bundled.map((e) => e.equipment)),
  categories: new Set(bundled.map((e) => e.category)),
  levels: new Set(bundled.map((e) => e.level)),
};

/** Every value RepDB 9ed9357 uses. A new one fails the build script, and belongs here too. */
const REPDB_MUSCLES = [
  'abductors', 'adductors', 'anterior_deltoid', 'biceps_brachii', 'brachialis', 'brachioradialis',
  'erector_spinae', 'forearm_extensors', 'forearm_flexors', 'forearms', 'gastrocnemius',
  'gluteus_maximus', 'gluteus_medius', 'hamstrings', 'hip_flexors', 'lateral_deltoid',
  'latissimus_dorsi', 'obliques', 'pectoralis_major', 'posterior_deltoid', 'quadratus_lumborum',
  'quadriceps', 'rectus_abdominis', 'rhomboids', 'serratus_anterior', 'soleus', 'supraspinatus',
  'transverse_abdominis', 'trapezius', 'triceps_brachii',
];
const REPDB_EQUIPMENT = [
  'none', 'ab_crunch_machine', 'ab_wheel', 'air_bike', 'assisted_pullup_machine', 'back_extension_machine',
  'barbell', 'battle_rope', 'bicep_curl_machine', 'cable', 'chest_fly_machine', 'chest_press_machine',
  'climbing_rope', 'dip_machine', 'dip_station', 'donkey_calf_raise_machine', 'dumbbell', 'elliptical',
  'ez_bar', 'flat_bench', 'glute_ham_developer', 'hack_squat', 'hip_abduction_machine',
  'hip_adduction_machine', 'hip_thrust_machine', 'jump_rope', 'kettlebell', 'lat_pulldown_machine',
  'leg_curl', 'leg_extension', 'leg_press', 'loop_band', 'pec_deck', 'plate_loaded_lateral_raise_machine',
  'plates', 'plyo_box', 'preacher_curl_machine', 'pull_up_bar', 'resistance_band', 'rings', 'rower',
  'seated_calf_raise_machine', 'shoulder_press_machine', 'shrug_machine', 'slam_ball', 'sled',
  'smith_machine', 'stability_ball', 'stair_climber', 'standing_calf_raise_machine', 'stationary_bike',
  'suspension_trainer', 'trap_bar', 'treadmill', 'tricep_extension_machine', 'wrist_roller',
];

describe('RepDB mapping onto the app vocabulary', () => {
  it('maps every muscle RepDB uses onto a region the muscle map draws', () => {
    for (const m of REPDB_MUSCLES) {
      expect(MUSCLES, m).toHaveProperty(m);
      expect(ours.muscles.has((MUSCLES as Record<string, string>)[m]), m).toBe(true);
    }
  });

  it('maps every equipment value onto one the library filters on', () => {
    for (const e of REPDB_EQUIPMENT) {
      expect(EQUIPMENT, e).toHaveProperty(e);
      expect(ours.equipment.has((EQUIPMENT as Record<string, string>)[e]), e).toBe(true);
    }
  });

  it('files calisthenics kit as bodyweight', () => {
    for (const e of ['none', 'pull_up_bar', 'rings', 'dip_station', 'suspension_trainer']) {
      expect((EQUIPMENT as Record<string, string>)[e]).toBe('body only');
    }
  });

  it('uses only categories and levels the catalogue already has, never a user one', () => {
    for (const c of Object.values(CATEGORIES)) {
      expect(ours.categories.has(c), c).toBe(true);
      expect((USER_EXERCISE_CATEGORIES as readonly string[]).includes(c)).toBe(false);
    }
    for (const l of Object.values(LEVELS)) expect(ours.levels.has(l), l).toBe(true);
    expect(Object.values(FORCES).every((f) => f == null || ['push', 'pull', 'static'].includes(f))).toBe(true);
  });
});

const row = (over: Record<string, unknown> = {}) => ({
  id: 'archer-push-ups',
  name_en: 'Archer Push Ups',
  category: 'strength',
  force_type: 'push',
  mechanic: 'compound',
  difficulty: 'advanced',
  equipment: null,
  primary_muscles: ['pectoralis_major'],
  secondary_muscles: ['triceps_brachii', 'anterior_deltoid', 'lateral_deltoid'],
  instructions_en: ['Go down.', 'Come up.'],
  tips_en: ['Stay tight.'],
  ...over,
});

describe('mapping RepDB rows', () => {
  it('prefixes ids so they can never collide with the bundled catalogue', () => {
    const { exercises } = mapRepdb([row()], []);
    expect(exercises[0].id).toBe('repdb:archer-push-ups');
    expect(exercises[0]).toMatchObject({
      equipment: 'body only',
      level: 'expert',
      primaryMuscles: ['chest'],
      secondaryMuscles: ['triceps', 'shoulders'],
      instructions: ['Go down.', 'Come up.', 'Tip: Stay tight.'],
    });
  });

  it('skips an exercise the catalogue already has, however it is spelled', () => {
    expect(normName('Push-Ups')).toBe(normName('Push ups'));
    const r = mapRepdb([row({ name_en: 'Push-Ups' })], ['Push ups']);
    expect(r.exercises).toHaveLength(0);
    expect(r.duplicates).toEqual(['Push-Ups']);
  });

  it('reports an unknown value instead of silently dropping it', () => {
    const r = mapRepdb([row({ primary_muscles: ['tibialis_anterior'], equipment: 'hover_board' })], []);
    expect(r.unmapped).toEqual(['equipment:hover_board', 'muscle:tibialis_anterior']);
  });

  it('only references images the build produced', () => {
    const r = mapRepdb([row()], [], new Set(['archer-push-ups-start']));
    expect(r.exercises[0].images).toEqual(['repdb/archer-push-ups-start']);
  });
});
