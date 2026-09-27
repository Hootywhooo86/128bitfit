import { asc, desc, eq, isNull } from 'drizzle-orm';
import { db } from './client';
import { newId } from './id';
import { injuries, type Injury, type InjurySeverity } from './schema';
import { getSetting, setSetting } from './settings-queries';

export type InjuryInput = {
  area: string;
  severity: InjurySeverity;
  notes: string | null;
  avoid: string | null;
  startedAt: Date;
};

export async function listInjuries(): Promise<{ active: Injury[]; resolved: Injury[] }> {
  const rows = await db.select().from(injuries).orderBy(desc(injuries.startedAt));
  return {
    active: rows.filter((r) => r.resolvedAt == null),
    resolved: rows.filter((r) => r.resolvedAt != null),
  };
}

export async function listActiveInjuries(): Promise<Injury[]> {
  return db.select().from(injuries).where(isNull(injuries.resolvedAt)).orderBy(asc(injuries.startedAt));
}

export async function getInjury(id: string): Promise<Injury | null> {
  const rows = await db.select().from(injuries).where(eq(injuries.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function saveInjury(id: string | null, input: InjuryInput): Promise<string> {
  const area = input.area.trim();
  if (!area) throw new Error('Say where it hurts.');
  const values = {
    area,
    severity: input.severity,
    notes: input.notes?.trim() || null,
    avoid: input.avoid?.trim() || null,
    startedAt: input.startedAt,
  };
  if (id) {
    await db.update(injuries).set(values).where(eq(injuries.id, id));
    return id;
  }
  const newRow = newId('inj');
  await db.insert(injuries).values({ id: newRow, ...values, resolvedAt: null });
  return newRow;
}

export async function setInjuryResolved(id: string, resolved: boolean): Promise<void> {
  await db.update(injuries).set({ resolvedAt: resolved ? new Date() : null }).where(eq(injuries.id, id));
}

export async function deleteInjury(id: string): Promise<void> {
  await db.delete(injuries).where(eq(injuries.id, id));
}

const TELL_COACH = 'injury_tell_coach';

/** Whether active injuries go into the coach's summary. On unless turned off. */
export async function getTellCoach(): Promise<boolean> {
  return (await getSetting(TELL_COACH)) !== '0';
}

export async function setTellCoach(on: boolean): Promise<void> {
  await setSetting(TELL_COACH, on ? '1' : '0');
}
