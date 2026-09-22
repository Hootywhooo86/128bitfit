import { and, asc, count, eq, like, or, sql } from 'drizzle-orm';
import { db } from './client';
import { exercises, type Exercise } from './schema';

export type ExerciseFilters = {
  search?: string;
  equipment?: string | null;
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
  if (filters.equipment) {
    clauses.push(eq(exercises.equipment, filters.equipment));
  }
  if (filters.primaryMuscle) {
    // Quoted, so "lats" cannot match "latissimus" in some other entry.
    clauses.push(like(exercises.primaryMuscles, `%"${filters.primaryMuscle}"%`));
  }
  const where = clauses.length ? and(...clauses) : undefined;

  // SQLite's LIKE is case-insensitive for ASCII, so this needs no lowering.
  const rank = term
    ? sql`case
          when ${exercises.name} like ${`%${term}%`} then 0
          when ${exercises.primaryMuscles} like ${`%${term}%`} then 1
          else 2
        end`
    : sql`0`;

  return db
    .select()
    .from(exercises)
    .where(where)
    .orderBy(rank, asc(exercises.name))
    .limit(500);
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
