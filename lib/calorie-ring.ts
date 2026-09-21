/**
 * What the calorie ring should say.
 *
 * Split out of the component so the rule that matters can be tested: logging
 * nothing and eating nothing are different claims, and the UI must not render
 * them the same way. See the empty-state table in CLAUDE.md.
 */

export type CalorieRingState =
  /** No food logged today. Show the target; never a filled zero. */
  | { status: 'empty'; target: number }
  /** Logged, at or under target. `eaten` may legitimately be 0. */
  | { status: 'under'; eaten: number; target: number; remaining: number; pct: number }
  /** Logged, past target. */
  | { status: 'over'; eaten: number; target: number; exceededBy: number; pct: number };

/**
 * @param consumed calories eaten, or null when nothing has been logged.
 */
export function calorieRingState(consumed: number | null, target: number): CalorieRingState {
  if (consumed == null) return { status: 'empty', target };

  // A logged zero is a real reading and keeps the normal display.
  const eaten = Number.isFinite(consumed) ? consumed : 0;
  const safeTarget = Number.isFinite(target) && target > 0 ? target : 0;
  const pct = safeTarget > 0 ? Math.min(1, Math.max(0, eaten / safeTarget)) : 0;
  const remaining = Math.round(safeTarget - eaten);

  if (remaining < 0) {
    return { status: 'over', eaten, target: safeTarget, exceededBy: Math.abs(remaining), pct };
  }
  return { status: 'under', eaten, target: safeTarget, remaining, pct };
}
