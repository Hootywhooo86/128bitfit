import { and, asc, desc, eq, gt, inArray, ne } from 'drizzle-orm';
import { cardioStats, sportById, type DistanceUnit, type Fix } from '@/lib/cardio';
import { db } from './client';
import { newId } from './id';
import { cardioPoints, cardioSessions, type CardioSession } from './schema';

export type NewFix = {
  t: number;
  lat: number;
  lon: number;
  alt: number | null;
  accuracy: number | null;
  speed: number | null;
};

/** The session being recorded or paused right now, if any — including one an app kill interrupted. */
export async function getOpenCardioSession(): Promise<CardioSession | null> {
  const rows = await db
    .select()
    .from(cardioSessions)
    .where(ne(cardioSessions.status, 'finished'))
    .orderBy(desc(cardioSessions.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function startCardioSession(sport: string, at = Date.now()): Promise<string> {
  const id = newId('cardio');
  await db.insert(cardioSessions).values({ id, sport, status: 'recording', startedAt: at });
  return id;
}

export async function getCardioSession(id: string): Promise<CardioSession | null> {
  const rows = await db.select().from(cardioSessions).where(eq(cardioSessions.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Store fixes against whichever session is recording.
 *
 * Called from the background location task, which knows nothing about the
 * screen: while paused, or with nothing recording, the fixes are dropped.
 */
export async function recordFixes(fixes: readonly NewFix[]): Promise<number> {
  if (fixes.length === 0) return 0;
  const open = await getOpenCardioSession();
  if (!open || open.status !== 'recording') return 0;
  const rows = fixes
    .filter((f) => f.t >= open.startedAt)
    .map((f) => ({ ...f, sessionId: open.id, segment: open.segment }));
  if (rows.length > 0) await db.insert(cardioPoints).values(rows);
  return rows.length;
}

export async function pauseCardioSession(id: string, at = Date.now()): Promise<void> {
  await db
    .update(cardioSessions)
    .set({ status: 'paused', pausedAt: at })
    .where(and(eq(cardioSessions.id, id), eq(cardioSessions.status, 'recording')));
}

export async function resumeCardioSession(id: string, at = Date.now()): Promise<void> {
  const s = await getCardioSession(id);
  if (!s || s.status !== 'paused') return;
  await db
    .update(cardioSessions)
    .set({
      status: 'recording',
      pausedAt: null,
      pausedMs: s.pausedMs + Math.max(0, at - (s.pausedAt ?? at)),
      // A new stretch: nothing is drawn or counted across the pause.
      segment: s.segment + 1,
    })
    .where(eq(cardioSessions.id, id));
}

/** Time on the clock, less manual pauses. */
export function elapsedMs(s: Pick<CardioSession, 'startedAt' | 'endedAt' | 'pausedAt' | 'pausedMs'>, now = Date.now()): number {
  const end = s.endedAt ?? s.pausedAt ?? now;
  return Math.max(0, end - s.startedAt - s.pausedMs);
}

export async function getCardioFixes(sessionId: string, afterId = 0): Promise<(Fix & { id: number })[]> {
  const rows = await db
    .select()
    .from(cardioPoints)
    .where(and(eq(cardioPoints.sessionId, sessionId), gt(cardioPoints.id, afterId)))
    .orderBy(asc(cardioPoints.id));
  return rows.map((r) => ({
    id: r.id,
    t: r.t,
    lat: r.lat,
    lon: r.lon,
    alt: r.alt,
    accuracy: r.accuracy,
    speed: r.speed,
    segment: r.segment,
  }));
}

/** Close a session and write its totals, computed from the fixes it recorded. */
export async function finishCardioSession(
  id: string,
  opts: { autoPause: boolean; unit: DistanceUnit },
  at = Date.now()
): Promise<CardioSession | null> {
  const s = await getCardioSession(id);
  if (!s) return null;
  // Finishing while paused ends the session at the pause, not now.
  const endedAt = s.status === 'paused' && s.pausedAt ? s.pausedAt : at;
  const stats = cardioStats(await getCardioFixes(id), sportById(s.sport), opts);
  await db
    .update(cardioSessions)
    .set({
      status: 'finished',
      endedAt,
      pausedAt: null,
      distanceM: stats.distanceM,
      movingS: Math.round(stats.movingS),
      elapsedS: Math.round(elapsedMs({ ...s, endedAt, pausedAt: null }) / 1000),
      elevGainM: stats.elevGainM,
    })
    .where(eq(cardioSessions.id, id));
  return getCardioSession(id);
}

/** Treadmill or indoor ride: typed in, no route. */
export async function saveManualCardio(input: {
  sport: string;
  startedAt: number;
  durationS: number;
  distanceM: number | null;
  notes?: string | null;
}): Promise<string> {
  const id = newId('cardio');
  await db.insert(cardioSessions).values({
    id,
    sport: input.sport,
    status: 'finished',
    startedAt: input.startedAt,
    endedAt: input.startedAt + input.durationS * 1000,
    distanceM: input.distanceM,
    movingS: input.durationS,
    elapsedS: input.durationS,
    manual: true,
    notes: input.notes ?? null,
  });
  return id;
}

export async function listCardioSessions(limit = 50): Promise<CardioSession[]> {
  return db
    .select()
    .from(cardioSessions)
    .where(eq(cardioSessions.status, 'finished'))
    .orderBy(desc(cardioSessions.startedAt))
    .limit(limit);
}

export async function deleteCardioSession(id: string): Promise<void> {
  await db.delete(cardioPoints).where(eq(cardioPoints.sessionId, id));
  await db.delete(cardioSessions).where(eq(cardioSessions.id, id));
}

/** Throw away an open session that never recorded anything worth keeping. */
export async function discardCardioSessions(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.delete(cardioPoints).where(inArray(cardioPoints.sessionId, [...ids]));
  await db.delete(cardioSessions).where(inArray(cardioSessions.id, [...ids]));
}
