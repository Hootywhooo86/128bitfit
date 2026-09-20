import { desc, eq } from 'drizzle-orm';
import { db } from './client';
import { newId } from './id';
import { weightEntries, type WeightEntry } from './schema';
import type { WeightUnit } from './settings-queries';

export async function addWeightEntry(input: {
  value: number;
  unit: WeightUnit;
  loggedAt?: Date;
  note?: string | null;
}): Promise<string> {
  const id = newId('we');
  await db.insert(weightEntries).values({
    id,
    kgOrLb: input.value,
    unit: input.unit,
    loggedAt: input.loggedAt ?? new Date(),
    note: input.note ?? null,
  });
  return id;
}

export async function listRecentWeightEntries(limit = 7): Promise<WeightEntry[]> {
  return db
    .select()
    .from(weightEntries)
    .orderBy(desc(weightEntries.loggedAt))
    .limit(limit);
}

export async function getLatestWeightEntry(): Promise<WeightEntry | null> {
  const rows = await listRecentWeightEntries(1);
  return rows[0] ?? null;
}

export async function deleteWeightEntry(id: string): Promise<void> {
  await db.delete(weightEntries).where(eq(weightEntries.id, id));
}

export function formatWeight(entry: Pick<WeightEntry, 'kgOrLb' | 'unit'>): string {
  const n = entry.kgOrLb;
  const rounded = Math.round(n * 10) / 10;
  return `${rounded} ${entry.unit}`;
}
