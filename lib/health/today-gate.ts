/**
 * What to show for today's health reading, decided from availability and
 * grants alone.
 *
 * Split out of the hook and kept pure because these are the cases CLAUDE.md's
 * empty-state table calls genuinely different, and getting one wrong means the
 * app claims a measurement it never took. The hook does the I/O; this decides
 * what the answers mean.
 */
import type { HealthAvailability, HealthGrants } from './types';

export type TodayHealth =
  | { status: 'checking' }
  | { status: 'unavailable' }
  | { status: 'update' }
  | { status: 'denied' }
  | { status: 'ready'; steps: number | null };

/**
 * Whether it is worth reading, and what to say when it is not.
 *
 * `grants` is null when the lookup itself failed — which is not the same as a
 * lookup that came back empty, but both mean we cannot read, so both land on
 * "not connected" with a way to fix it.
 */
export function todayHealthGate(
  availability: HealthAvailability,
  grants: HealthGrants | null
): TodayHealth | 'read' {
  if (availability === 'unavailable') return { status: 'unavailable' };
  if (availability === 'update_required') return { status: 'update' };

  // Ask whether *steps* was granted, not whether everything was. The app
  // requests 32 permissions and Health Connect lets the user tick some and not
  // others, so requiring the full set reported "denied" to anyone who had
  // connected and granted steps — which is most people.
  if (!grants || !grants.read.includes('steps')) return { status: 'denied' };
  return 'read';
}

/** True when two readings are the same fact, so subscribers are not woken for nothing. */
export function sameTodayHealth(a: TodayHealth, b: TodayHealth): boolean {
  if (a.status !== b.status) return false;
  if (a.status === 'ready' && b.status === 'ready') return a.steps === b.steps;
  return true;
}
