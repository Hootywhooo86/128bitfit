import { asc, desc, eq } from 'drizzle-orm';
import { db } from './client';
import { newId } from './id';
import {
  coachMessages,
  coachThreads,
  type CoachMessage,
  type CoachThread,
} from './schema';
import type { CoachMode } from './coach-context';
import { coachModeLabel } from './coach-context';

export async function createCoachThread(
  mode: CoachMode,
  title?: string
): Promise<CoachThread> {
  const now = new Date();
  const row = {
    id: newId('cth'),
    mode,
    title: title?.trim() || coachModeLabel(mode),
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(coachThreads).values(row);
  return row;
}

export async function listCoachThreads(limit = 20): Promise<CoachThread[]> {
  return db
    .select()
    .from(coachThreads)
    .orderBy(desc(coachThreads.updatedAt))
    .limit(limit);
}

export async function getCoachThread(id: string): Promise<CoachThread | null> {
  const rows = await db
    .select()
    .from(coachThreads)
    .where(eq(coachThreads.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function listCoachMessages(threadId: string): Promise<CoachMessage[]> {
  return db
    .select()
    .from(coachMessages)
    .where(eq(coachMessages.threadId, threadId))
    .orderBy(asc(coachMessages.createdAt));
}

export async function appendCoachMessage(
  threadId: string,
  role: 'user' | 'assistant' | 'system',
  content: string
): Promise<CoachMessage> {
  const now = new Date();
  const row = {
    id: newId('cmsg'),
    threadId,
    role,
    content,
    createdAt: now,
  };
  await db.insert(coachMessages).values(row);
  await db
    .update(coachThreads)
    .set({ updatedAt: now })
    .where(eq(coachThreads.id, threadId));
  return row;
}
