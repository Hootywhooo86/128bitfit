import { desc, eq } from 'drizzle-orm';
import { db } from './client';
import { newId } from './id';
import { weightEntries, type WeightEntry } from './schema';
import type { WeightUnit } from './settings-queries';
import { mirrorWeight, mirrorWeightRemoved } from '@/lib/health/mirror';

/** Health Connect stores kilograms, whatever the user types in. */
export function weightInKg(entry: Pick<WeightEntry, 'kgOrLb' | 'unit'>): number {
  return entry.unit === 'kg' ? entry.kgOrLb : entry.kgOrLb * 0.453592;
}

export async function addWeightEntry(input: {
  value: number;
  unit: WeightUnit;
  loggedAt?: Date;
  note?: string | null;
}): Promise<string> {
  const id = newId('we');
  const loggedAt = input.loggedAt ?? new Date();
  await db.insert(weightEntries).values({
    id,
    kgOrLb: input.value,
    unit: input.unit,
    loggedAt,
    note: input.note ?? null,
  });
  mirrorWeight(id, loggedAt.getTime(), weightInKg({ kgOrLb: input.value, unit: input.unit }));
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
  mirrorWeightRemoved(id);
}

export function formatWeight(entry: Pick<WeightEntry, 'kgOrLb' | 'unit'>): string {
  const n = entry.kgOrLb;
  const rounded = Math.round(n * 10) / 10;
  return `${rounded} ${entry.unit}`;
}
