/**
 * Whether the screen should be held awake right now.
 *
 * Its own function because the bug this feature can have is a screen that stays
 * on after the workout ends — a battery drain the user would blame on the app
 * and could not see the cause of. The rule is worth pinning down away from the
 * effect that acts on it.
 *
 * Pure: setting and session state in, yes or no out.
 */
import type { SessionStatus } from '@/db/schema';

export function shouldKeepAwake(
  settingOn: boolean,
  status: SessionStatus | null | undefined
): boolean {
  // Only an actually running session. 'completed' and 'discarded' are both how
  // a workout ends, and neither is a reason to keep someone's screen lit.
  return settingOn && status === 'in_progress';
}
