/**
 * Supersets: two or more exercises done back to back, resting only after
 * the last of them.
 *
 * Pure, so the rest rule — the part that would be most annoying to get
 * wrong mid-set — is tested.
 */

export type SupersetMember = { id: string; supersetGroup: string | null };

/** "A1", "A2", "B1"… lettered by where each group first appears in the workout. */
export function supersetLabels(exercises: readonly SupersetMember[]): Map<string, string> {
  const letters = new Map<string, string>();
  const counts = new Map<string, number>();
  const out = new Map<string, string>();
  const size = new Map<string, number>();
  for (const e of exercises) if (e.supersetGroup) size.set(e.supersetGroup, (size.get(e.supersetGroup) ?? 0) + 1);
  for (const e of exercises) {
    const g = e.supersetGroup;
    // A group of one is not a superset (its partner was removed).
    if (!g || (size.get(g) ?? 0) < 2) continue;
    if (!letters.has(g)) letters.set(g, String.fromCharCode(65 + (letters.size % 26)));
    const n = (counts.get(g) ?? 0) + 1;
    counts.set(g, n);
    out.set(e.id, `${letters.get(g)}${n}`);
  }
  return out;
}

/**
 * After a set is ticked: rest, or go straight to the next exercise in the
 * superset?
 *
 * Not the last of its group → no rest, and the next member becomes current.
 * The last → rest, and the first member is current again for the next round.
 * Not in a (real) superset → rest as normal, current unchanged.
 */
export function afterSupersetTick(
  exercises: readonly SupersetMember[],
  tickedId: string
): { rest: boolean; nextCurrentId: string } {
  const ticked = exercises.find((e) => e.id === tickedId);
  const g = ticked?.supersetGroup;
  const members = g ? exercises.filter((e) => e.supersetGroup === g) : [];
  if (!ticked || members.length < 2) return { rest: true, nextCurrentId: tickedId };
  const i = members.findIndex((e) => e.id === tickedId);
  if (i < members.length - 1) return { rest: false, nextCurrentId: members[i + 1].id };
  return { rest: true, nextCurrentId: members[0].id };
}

/**
 * Linking an exercise with the next one: the group both should end up in.
 * Joins the next one's group if it has one, keeps this one's if it has one,
 * otherwise starts a new group.
 */
export function groupForLink(current: SupersetMember, next: SupersetMember, newGroupId: string): string {
  return next.supersetGroup ?? current.supersetGroup ?? newGroupId;
}
