import { and, asc, count, eq, like, sql } from 'drizzle-orm';
import { db } from './client';
import { exercises, type Exercise } from './schema';

export type ExerciseFilters = {
  search?: string;
  equipment?: string | null;
  primaryMuscle?: string | null;
};

export async function listExercises(filters: ExerciseFilters = {}): Promise<Exercise[]> {
  const clauses = [];
  if (filters.search?.trim()) {
    clauses.push(like(exercises.name, `%${filters.search.trim()}%`));
  }
  if (filters.equipment) {
    clauses.push(eq(exercises.equipment, filters.equipment));
  }
  if (filters.primaryMuscle) {
    // primary_muscles stored as JSON array text — LIKE match is good enough offline
    clauses.push(like(exercises.primaryMuscles, `%"${filters.primaryMuscle}"%`));
  }
  const where = clauses.length ? and(...clauses) : undefined;
  return db
    .select()
    .from(exercises)
    .where(where)
    .orderBy(asc(exercises.name))
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
