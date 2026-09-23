/**
 * Turning a coach conversation into the messages a provider sees.
 *
 * What was wrong: every question rebuilt the request as system + one user
 * message, so the model never saw what it had just said. Asking "why?" after
 * an answer got a reply to "why?" alone. Three questions in a row were three
 * unrelated conversations wearing one screen.
 *
 * The opening message is special. It carries the mode's instructions and the
 * ~1,500-token local summary, and it is the only place that summary appears —
 * resending it every turn would multiply the cost of a long conversation by
 * the number of turns in it, for a block the model already has.
 *
 * Pure: no database, no network.
 */
import type { ChatMessage } from './ai-coach';

export type CoachTurn = {
  role: 'user' | 'assistant';
  content: string;
};

/**
 * How many follow-up turns to carry.
 *
 * A cap rather than the whole history because the opening block is already
 * large and an on-device model has a few thousand tokens to work with, not a
 * few hundred thousand. Twelve is six exchanges, which is longer than any
 * useful "why did you say that" thread and short enough to stay affordable.
 */
export const MAX_FOLLOW_UP_TURNS = 12;

export function buildCoachMessages(input: {
  system: string;
  /** First user message: mode instructions plus the local context block. */
  opening: string;
  /** Everything after the opening, oldest first. */
  turns: readonly CoachTurn[];
  maxTurns?: number;
}): ChatMessage[] {
  const max = input.maxTurns ?? MAX_FOLLOW_UP_TURNS;
  const usable = input.turns.filter((t) => t.content.trim().length > 0);

  // Keep the most recent. The oldest follow-ups are the ones a long thread can
  // afford to lose; the opening is never one of them, because dropping it
  // would strand the model with a conversation about data it cannot see.
  let kept = max > 0 ? usable.slice(-max) : [];
  const trimmed = kept.length < usable.length;

  // Only when something was actually cut. An assistant turn at the very start
  // of an untrimmed thread is the reply to the opening, which is still there —
  // dropping that would throw away the answer the user is asking about.
  if (trimmed) {
    while (kept.length > 0 && kept[0].role === 'assistant') kept = kept.slice(1);
  }

  return [
    { role: 'system', content: input.system },
    { role: 'user', content: input.opening },
    ...kept.map((t) => ({ role: t.role, content: t.content })),
  ];
}

/**
 * Whether this is the first thing being asked in the thread.
 *
 * Decides whether the question rides the opening block or goes on its own.
 */
export function isOpeningTurn(turns: readonly CoachTurn[]): boolean {
  return turns.every((t) => t.content.trim().length === 0);
}

/** A short title for the thread, from whatever was asked first. */
export function threadTitle(question: string, fallback: string): string {
  const q = question.trim().replace(/\s+/g, ' ');
  if (!q) return fallback;
  return q.length <= 60 ? q : `${q.slice(0, 57)}…`;
}
