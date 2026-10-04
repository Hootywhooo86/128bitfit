/**
 * What each home-screen widget says, worked out from the app's own data.
 *
 * Pure, so the honesty rules can be tested: nothing logged is an empty ring
 * showing the target, not a filled 0; no Health Connect reading is a dash, not
 * 0 kcal burned; no workout running says so. The widgets themselves
 * (widgets/*.tsx) only draw what this returns.
 */
import { MUSCLE_GROUPS, MUSCLE_LABELS, loadLevel, type MuscleTally } from './muscle-load';
import { muscleHeat } from './theme';

// ---- TODAY ----------------------------------------------------------------

export type BurnedReading =
  | { status: 'reading'; kcal: number; at: number }
  | { status: 'not_connected' }
  | { status: 'unavailable' };

export type TodayModel = {
  target: number;
  eaten: number;
  /** Nothing logged today: the ring is the target, unfilled. */
  nothingLogged: boolean;
  /** 0–1, capped; over-target is shown by the text, not a ring past full. */
  fill: number;
  over: boolean;
  calorieLine: string;
  proteinLine: string;
  burnedLine: string;
};

export function todayModel(input: {
  calorieTarget: number;
  proteinTarget: number;
  calories: number;
  protein: number;
  /** Some logged food has no protein figure, so the total is a floor. */
  proteinPartial: boolean;
  logCount: number;
  burned: BurnedReading;
  now?: number;
}): TodayModel {
  const target = Math.max(0, Math.round(input.calorieTarget));
  const eaten = Math.max(0, Math.round(input.calories));
  const nothingLogged = input.logCount === 0;
  const over = !nothingLogged && eaten > target;
  const left = target - eaten;
  const proteinLeft = Math.max(0, Math.round(input.proteinTarget - input.protein));
  const now = input.now ?? Date.now();

  let burnedLine: string;
  if (input.burned.status === 'reading') {
    const stale = now - input.burned.at > 45 * 60_000;
    const at = new Date(input.burned.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    burnedLine = `${Math.round(input.burned.kcal)} kcal burned${stale ? ` · at ${at}` : ''}`;
  } else if (input.burned.status === 'not_connected') {
    burnedLine = 'Burned — not connected';
  } else {
    burnedLine = 'Burned — not on this phone';
  }

  return {
    target,
    eaten,
    nothingLogged,
    fill: nothingLogged || target <= 0 ? 0 : Math.min(1, eaten / target),
    over,
    calorieLine: nothingLogged
      ? `${target} kcal to eat`
      : over
        ? `${eaten} of ${target} · ${-left} over`
        : `${eaten} of ${target} · ${left} left`,
    proteinLine: nothingLogged
      ? `Protein ${Math.round(input.proteinTarget)} g to go`
      : proteinLeft === 0
        ? 'Protein target hit'
        : // Food with no protein figure makes the total a floor, so what is left is a ceiling.
          `Protein ${input.proteinPartial ? 'up to ' : ''}${proteinLeft} g to go`,
    burnedLine,
  };
}

/** The calorie ring as an SVG string. Accent for the fill; over-target text is red, the ring is not. */
export function ringSvg(fill: number, accent: string, track = '#212121', size = 120): string {
  const stroke = Math.round(size * 0.11);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fill));
  const arc =
    f > 0
      ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${accent}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`
      : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="${stroke}"/>${arc}</svg>`;
}

// ---- WORKOUT IN PROGRESS ----------------------------------------------------

export type WidgetSet = {
  id: string;
  completed: boolean;
  isWarmup: boolean;
  reps: number | null;
  weight: number | null;
  weightUnit: string | null;
  distanceM: number | null;
};

export type WidgetExercise = {
  id: string;
  name: string;
  track: string;
  restSeconds: number | null;
  sets: WidgetSet[];
};

export type WorkoutModel =
  | { state: 'none' }
  | { state: 'all_done'; sessionId: string; restUntil: number | null }
  | {
      state: 'next';
      sessionId: string;
      sessionExerciseId: string;
      setId: string;
      exerciseName: string;
      /** "Set 3 of 4" */
      setLabel: string;
      /** "185 × 5 lb", "2 × 24 kg · 40 m", or "Enter weight in the app" */
      line: string;
      /** False when the set has nothing filled in to log yet. */
      canLogFromWidget: boolean;
      restSeconds: number;
      restUntil: number | null;
    };

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ''));

export function setLine(set: WidgetSet, track: string): string | null {
  const unit = set.weightUnit ?? 'lb';
  if (track === 'distance') {
    if (set.distanceM == null || set.distanceM <= 0) return null;
    return set.weight != null && set.weight > 0
      ? `${fmt(set.weight)} ${unit} · ${fmt(set.distanceM)} m`
      : `${fmt(set.distanceM)} m`;
  }
  if (set.reps == null || set.reps <= 0) return null;
  return set.weight != null && set.weight > 0 ? `${fmt(set.weight)} × ${set.reps} ${unit}` : `${set.reps} reps`;
}

/**
 * The next set to do: the first unfinished one, in exercise order. Warm-ups
 * count — they are on the list in the app too — but the label says so.
 */
export function workoutModel(
  session: { id: string } | null,
  exercises: readonly WidgetExercise[],
  restEndsAt: number | null,
  now = Date.now()
): WorkoutModel {
  if (!session) return { state: 'none' };
  const restUntil = restEndsAt != null && restEndsAt > now ? restEndsAt : null;
  for (const ex of exercises) {
    const idx = ex.sets.findIndex((s) => !s.completed);
    if (idx < 0) continue;
    const set = ex.sets[idx];
    const line = setLine(set, ex.track);
    return {
      state: 'next',
      sessionId: session.id,
      sessionExerciseId: ex.id,
      setId: set.id,
      exerciseName: ex.name,
      setLabel: `${set.isWarmup ? 'Warm-up' : 'Set'} ${idx + 1} of ${ex.sets.length}`,
      line: line ?? 'Fill this set in the app',
      canLogFromWidget: line != null,
      restSeconds: ex.restSeconds ?? 60,
      restUntil,
    };
  }
  return { state: 'all_done', sessionId: session.id, restUntil };
}

// ---- MUSCLE MAP -------------------------------------------------------------

/**
 * This week's muscles as a grid of tiles on the fixed heat scale — grey
 * untouched, yellow 1–3 sets, orange 4–7, red 8+. The scale never takes the
 * accent; colour here only ever means load.
 */
export function muscleGridSvg(tally: MuscleTally, width = 300, height = 300): string {
  const cols = 3;
  const rows = Math.ceil(MUSCLE_GROUPS.length / cols);
  const gap = 4;
  const w = (width - gap * (cols - 1)) / cols;
  const h = (height - gap * (rows - 1)) / rows;
  const fs = Math.max(9, Math.min(14, h * 0.32));
  const cells = MUSCLE_GROUPS.map((m, i) => {
    const level = loadLevel(tally[m]);
    const fill = muscleHeat[level];
    const x = (i % cols) * (w + gap);
    const y = Math.floor(i / cols) * (h + gap);
    const ink = level === 'none' ? '#8c8c8c' : '#000000';
    const label = MUSCLE_LABELS[m].toUpperCase().slice(0, 10);
    return (
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="6" fill="${fill}"/>` +
      `<text x="${(x + w / 2).toFixed(1)}" y="${(y + h / 2 + fs * 0.35).toFixed(1)}" font-family="sans-serif" font-weight="bold" font-size="${fs.toFixed(1)}" text-anchor="middle" fill="${ink}">${escapeXml(label)}</text>`
    );
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${cells}</svg>`;
}

export function trainedCount(tally: MuscleTally): number {
  return MUSCLE_GROUPS.filter((m) => loadLevel(tally[m]) !== 'none').length;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
