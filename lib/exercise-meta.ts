import { equipmentGroup, equipmentGroupLabel } from './equipment-groups';
import { parseJsonArray } from './exercise-images';

/** "middle back" → "Middle back". For chips and meta lines; filter values stay raw. */
export function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

type MetaSource = {
  equipment: string | null;
  level: string | null;
  category: string | null;
  primaryMuscles: string;
};

/**
 * The grey line under an exercise's name: "Bodyweight · Beginner · Abdominals".
 *
 * The equipment is shown as its filter group, so the line and the chips use
 * the same words — "body only" and "e-z curl bar" were each source's own
 * spelling. "Other" says nothing and is left out.
 */
export function exerciseMetaLine(e: MetaSource): string {
  const group = equipmentGroup(e.equipment);
  return [
    group === 'other' ? null : equipmentGroupLabel(group),
    e.category === 'custom' ? 'Yours' : null,
    e.level ? capitalise(e.level) : null,
    parseJsonArray(e.primaryMuscles).slice(0, 2).map(capitalise).join(', ') || null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Tapping a picked exercise again unpicks it; otherwise it joins the end.
 *
 * The order is the order they were tapped, which is the order they go into
 * the workout or routine — picking in the order you mean to lift saves
 * reordering afterwards.
 */
export function toggleById<T extends { id: string }>(list: readonly T[], item: T): T[] {
  return list.some((x) => x.id === item.id) ? list.filter((x) => x.id !== item.id) : [...list, item];
}
