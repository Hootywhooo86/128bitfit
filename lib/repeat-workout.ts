/**
 * "Do that again": turning a finished session into the plan for a new one.
 *
 * Same exercises, same order, same supersets, as many working sets as were
 * actually done. The numbers in those sets come from the usual pre-fill, so
 * they are last time's weights — nothing here invents a load.
 */

export type RepeatSource = {
  exerciseId: string;
  restSeconds: number | null;
  notes: string | null;
  supersetGroup: string | null;
  sets: { completed: boolean; isWarmup: boolean; setType: string }[];
};

export type RepeatItem = {
  exerciseId: string;
  restSeconds: number | null;
  notes: string | null;
  supersetGroup: string | null;
  workingSets: number;
};

/**
 * `newGroupId` is called once per superset in the source, so the copy's
 * groups are its own: unlinking one in the new session must not touch the old.
 */
export function repeatPlan(source: readonly RepeatSource[], newGroupId: () => string): RepeatItem[] {
  const groups = new Map<string, string>();
  return source.map((ex) => {
    const working = ex.sets.filter((s) => !s.isWarmup && s.setType === 'normal');
    const done = working.filter((s) => s.completed).length;
    let group: string | null = null;
    if (ex.supersetGroup) {
      if (!groups.has(ex.supersetGroup)) groups.set(ex.supersetGroup, newGroupId());
      group = groups.get(ex.supersetGroup)!;
    }
    return {
      exerciseId: ex.exerciseId,
      restSeconds: ex.restSeconds,
      notes: ex.notes,
      supersetGroup: group,
      // What was done; if it was skipped entirely, what was planned; never none.
      workingSets: Math.max(1, done || working.length),
    };
  });
}
