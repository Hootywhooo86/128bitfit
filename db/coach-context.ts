import { getDayFuelSummary } from './food-queries';
import { getTellCoach, listActiveInjuries } from './injury-queries';
import { getAppSettings } from './settings-queries';
import { getLatestWeightEntry, formatWeight } from './weight-queries';
import { getLastCompletedWorkoutSummary } from './workout-queries';

export type CoachMode = 'debrief' | 'ask' | 'checkin';

export type CoachContextSummary = {
  mode: CoachMode;
  assembledAt: string;
  displayName: string;
  today: {
    calories: number;
    calorieTarget: number;
    protein: number;
    proteinTarget: number;
    fat: number;
    carb: number;
    waterMl: number;
    waterTargetMl: number;
    mealCount: number;
  };
  lastWorkout: {
    date: string;
    durationMin: number;
    setCount: number;
    exerciseCount: number;
    exerciseNames: string[];
    /** Compact per-exercise set counts for the prompt. */
    setsSummary: string;
  } | null;
  recentWeight: {
    value: string;
    loggedAt: string;
    note: string | null;
  } | null;
  goals: {
    calorieTarget: number;
    proteinTarget: number;
    waterTargetMl: number;
    units: string;
  };
  /** Plain-text block for the user/context portion of the AI prompt. */
  promptBlock: string;
};

const MODE_LABELS: Record<CoachMode, string> = {
  debrief: 'Post-workout debrief',
  ask: 'Ask anything',
  checkin: 'Weekly check-in',
};

export function coachModeLabel(mode: CoachMode): string {
  return MODE_LABELS[mode] ?? mode;
}

export async function buildCoachContext(mode: CoachMode): Promise<CoachContextSummary> {
  const [settings, fuel, lastWorkout, weight, tellCoach, hurts] = await Promise.all([
    getAppSettings(),
    getDayFuelSummary(new Date()),
    getLastCompletedWorkoutSummary(),
    getLatestWeightEntry(),
    getTellCoach(),
    listActiveInjuries(),
  ]);

  const today = {
    calories: Math.round(fuel.totals.calories),
    calorieTarget: settings.calorieTarget,
    protein: Math.round(fuel.totals.protein * 10) / 10,
    proteinTarget: settings.proteinTarget,
    fat: Math.round(fuel.totals.fat * 10) / 10,
    carb: Math.round(fuel.totals.carb * 10) / 10,
    waterMl: fuel.waterMl,
    waterTargetMl: settings.waterTargetMl,
    mealCount: fuel.logs.length,
  };

  const lastWorkoutBlock = lastWorkout
    ? {
        date: new Date(lastWorkout.session.startedAt!).toISOString(),
        durationMin: Math.round(lastWorkout.durationMs / 60000),
        setCount: lastWorkout.completedSets,
        exerciseCount: lastWorkout.exerciseCount,
        exerciseNames: lastWorkout.exercises.map((e) => e.name),
        setsSummary: lastWorkout.exercises
          .map((e) => `${e.name}: ${e.setCount} set${e.setCount === 1 ? '' : 's'}`)
          .join('; '),
      }
    : null;

  const recentWeight = weight
    ? {
        value: formatWeight(weight),
        loggedAt: new Date(weight.loggedAt!).toISOString(),
        note: weight.note,
      }
    : null;

  const goals = {
    calorieTarget: settings.calorieTarget,
    proteinTarget: settings.proteinTarget,
    waterTargetMl: settings.waterTargetMl,
    units: settings.units,
  };

  const lines: string[] = [
    `Mode: ${MODE_LABELS[mode]}`,
    `User: ${settings.displayName}`,
    `Units: ${settings.units}`,
    '',
    'Goals:',
    `- Calories: ${goals.calorieTarget} kcal/day`,
    `- Protein: ${goals.proteinTarget} g/day`,
    `- Water: ${goals.waterTargetMl} ml/day`,
    '',
    'Today nutrition:',
    `- Calories: ${today.calories} / ${today.calorieTarget} kcal`,
    `- Protein: ${today.protein} / ${today.proteinTarget} g`,
    `- Fat: ${today.fat} g · Carb: ${today.carb} g`,
    `- Water: ${today.waterMl} / ${today.waterTargetMl} ml`,
    `- Logged meals/items: ${today.mealCount}`,
  ];

  if (lastWorkoutBlock) {
    lines.push(
      '',
      'Last workout:',
      `- When: ${lastWorkoutBlock.date}`,
      `- Duration: ${lastWorkoutBlock.durationMin} min`,
      `- Sets completed: ${lastWorkoutBlock.setCount}`,
      `- Exercises (${lastWorkoutBlock.exerciseCount}): ${lastWorkoutBlock.exerciseNames.join(', ') || '—'}`,
      `- Sets summary: ${lastWorkoutBlock.setsSummary || '—'}`
    );
  } else {
    lines.push('', 'Last workout: none logged yet');
  }

  if (recentWeight) {
    lines.push(
      '',
      'Recent weight:',
      `- ${recentWeight.value} (logged ${recentWeight.loggedAt})`,
      recentWeight.note ? `- Note: ${recentWeight.note}` : ''
    );
  } else {
    lines.push('', 'Recent weight: none logged yet');
  }

  if (tellCoach && hurts.length > 0) {
    // What the user logged, in their words. The coach programs around it; it
    // does not diagnose or prescribe rehab (see the system prompt).
    lines.push(
      '',
      'Active pain/injury (user-reported, not a diagnosis — train around it, do not treat it):',
      ...hurts.map(
        (h) =>
          `- ${h.area} (${h.severity})${h.avoid ? ` · avoiding: ${h.avoid}` : ''}${h.notes ? ` · worse with: ${h.notes}` : ''}`
      )
    );
  }

  const promptBlock = lines.filter((l) => l !== undefined).join('\n').trim();

  return {
    mode,
    assembledAt: new Date().toISOString(),
    displayName: settings.displayName,
    today,
    lastWorkout: lastWorkoutBlock,
    recentWeight,
    goals,
    promptBlock,
  };
}

export const COACH_PLACEHOLDER_REPLY =
  'Bring your own key: add an AI provider + API key in Settings to enable coaching. Context below is assembled locally from SQLite — nothing is sent until you ask.';
