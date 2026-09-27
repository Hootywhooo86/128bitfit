/**
 * The library's equipment filter, in the handful of groups a person actually
 * picks between.
 *
 * The raw equipment column is whatever each source called it: free-exercise-db
 * says "machine" and "e-z curl bar", an openGym import says "Cable machine",
 * "Smith machine" and "Landmine", and a photographed machine says whatever was
 * typed. Listing those as-is put "Machine" and "machine" side by side as two
 * filters. Grouping by keyword folds every spelling into one chip, including
 * ones typed later that nobody listed here.
 *
 * Order matters: "Smith machine" is a machine, not a barbell, and "cable
 * machine" is a cable, not a machine.
 */

export type EquipmentGroup =
  | 'bodyweight'
  | 'dumbbell'
  | 'barbell'
  | 'kettlebell'
  | 'cable'
  | 'machine'
  | 'bands'
  | 'ball'
  | 'other';

/** Chip order in the library. */
export const EQUIPMENT_GROUPS: readonly { id: EquipmentGroup; label: string }[] = [
  { id: 'bodyweight', label: 'Bodyweight' },
  { id: 'dumbbell', label: 'Dumbbell' },
  { id: 'barbell', label: 'Barbell' },
  { id: 'kettlebell', label: 'Kettlebell' },
  { id: 'cable', label: 'Cable' },
  { id: 'machine', label: 'Machine' },
  { id: 'bands', label: 'Bands' },
  { id: 'ball', label: 'Ball' },
  { id: 'other', label: 'Other' },
];

const RULES: readonly [RegExp, EquipmentGroup][] = [
  [/cable|pulley/, 'cable'],
  [/smith|machine|leg press|hack squat|pec deck|treadmill|rower|elliptical|bike/, 'machine'],
  [/dumbbell/, 'dumbbell'],
  [/kettlebell/, 'kettlebell'],
  // A landmine is a barbell in a sleeve; a trap bar and an EZ bar are barbells too.
  [/barbell|e-?z |ez-?bar|curl bar|trap bar|hex bar|landmine|olympic bar/, 'barbell'],
  [/band/, 'bands'],
  [/ball/, 'ball'],
  [/body|^none$|pull-?up|chin-?up|rings?$|dip|suspension|trx/, 'bodyweight'],
];

/** The filter group for a raw equipment value. No value at all is "other". */
export function equipmentGroup(raw: string | null | undefined): EquipmentGroup {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) return 'other';
  for (const [pattern, group] of RULES) if (pattern.test(value)) return group;
  return 'other';
}

/** "Bodyweight" for a group id, for chips and row labels. */
export function equipmentGroupLabel(group: EquipmentGroup): string {
  return EQUIPMENT_GROUPS.find((g) => g.id === group)?.label ?? 'Other';
}
