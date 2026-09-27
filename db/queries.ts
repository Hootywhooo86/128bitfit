import { and, asc, count, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';
import { equipmentGroup, type EquipmentGroup } from '@/lib/equipment-groups';
import { db } from './client';
import { exercises, type Exercise } from './schema';

export type ExerciseFilters = {
  search?: string;
  /** One of the library's merged groups, not a raw equipment value. */
  equipmentGroup?: EquipmentGroup | null;
  primaryMuscle?: string | null;
};

/**
 * Search matches the muscles worked, not only the name.
 *
 * "chest" should find the bench press. Matching names alone meant the only way
 * to find every exercise for a body part was to already know what they were
 * called, which is backwards — the library exists for the case where you do
 * not. Equipment and category match too, so "cable" and "stretching" work.
 *
 * Name matches still come first. Someone typing "row" wants the rows, not
 * every exercise that happens to involve the lats, and burying the obvious
 * answer under forty others is its own kind of broken.
 */
export async function listExercises(filters: ExerciseFilters = {}): Promise<Exercise[]> {
  const clauses = [];
  const term = filters.search?.trim() ?? '';
  if (term) {
    const q = `%${term}%`;
    clauses.push(
      or(
        like(exercises.name, q),
        // Both muscle columns are JSON array text; a LIKE is good enough
        // offline and avoids a json_each per row on every keystroke.
        like(exercises.primaryMuscles, q),
        like(exercises.secondaryMuscles, q),
        like(exercises.equipment, q),
        like(exercises.category, q)
      )
    );
  }
  if (filters.equipmentGroup) {
    const group = filters.equipmentGroup;
    const raw = (await distinctEquipment()).filter((v) => equipmentGroup(v) === group);
    const matches = [];
    if (raw.length > 0) matches.push(inArray(exercises.equipment, raw));
    // An exercise with no equipment recorded is filed under "other".
    if (group === 'other') matches.push(isNull(exercises.equipment), eq(exercises.equipment, ''));
    // A group nothing belongs to matches nothing, rather than dropping the filter.
    clauses.push(matches.length > 0 ? or(...matches) : sql`0`);
  }
  if (filters.primaryMuscle) {
    // Quoted, so "lats" cannot match "latissimus" in some other entry.
    clauses.push(like(exercises.primaryMuscles, `%"${filters.primaryMuscle}"%`));
  }
  const where = clauses.length ? and(...clauses) : undefined;

  const query = db.select().from(exercises).where(where);
  if (!term) return query.orderBy(asc(exercises.name));

  // SQLite's LIKE is case-insensitive for ASCII, so this needs no lowering.
  // Only with a search term: a bare constant here, `ORDER BY 0`, is read by
  // SQLite as "the 0th column" and fails, which emptied the whole library.
  const rank = sql`case
          when ${exercises.name} like ${`%${term}%`} then 0
          when ${exercises.primaryMuscles} like ${`%${term}%`} then 1
          else 2
        end`;
  return query.orderBy(rank, asc(exercises.name));
}

/** How many exercises fall in each equipment group, for the library's chips. */
export async function equipmentGroupCounts(): Promise<Map<EquipmentGroup, number>> {
  const rows = await db
    .select({ equipment: exercises.equipment, n: count() })
    .from(exercises)
    .groupBy(exercises.equipment);
  const counts = new Map<EquipmentGroup, number>();
  for (const r of rows) {
    const g = equipmentGroup(r.equipment);
    counts.set(g, (counts.get(g) ?? 0) + r.n);
  }
  return counts;
}

export async function getExerciseById(id: string): Promise<Exercise | null> {
  const rows = await db.select().from(exercises).where(eq(exercises.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function distinctEquipment(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ equipment: exercises.equipment })
    .from(exercises)
    .orderBy(asc(exercises.equipment));
  return rows.map((r) => r.equipment).filter((v): v is string => Boolean(v));
}

export async function distinctPrimaryMuscles(): Promise<string[]> {
  const rows = await db.select({ primaryMuscles: exercises.primaryMuscles }).from(exercises);
  const set = new Set<string>();
  for (const row of rows) {
    try {
      const arr = JSON.parse(row.primaryMuscles) as string[];
      for (const m of arr) set.add(m);
    } catch {
      /* ignore */
    }
  }
  return [...set].sort();
}

export async function countExercises(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(exercises);
  return row?.n ?? 0;
}

export { sql };

/**
 * How many exercises the library actually holds, for display.
 *
 * Deliberately NOT getCounts().exercises. That one excludes the categories the
 * user owns, because it is compared against the bundled manifest to decide
 * whether a re-import is needed — counting a custom exercise there would make
 * the app re-import on every launch and delete it. This one is the opposite
 * question: everything you can browse, including what you made.
 */
export async function countLibraryExercises(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(exercises);
  return Number(row?.n ?? 0);
}
