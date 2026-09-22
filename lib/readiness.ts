/**
 * Readiness and rest quality.
 *
 * Both are read from Health Connect, never invented. If the data is not there
 * the answer is "not enough data" with a note saying what is missing — a score
 * conjured from nothing is exactly the fake-Health-Connect-sync mistake that
 * got the original prototype thrown away.
 *
 * This is an estimate even when it has data, and the UI says so. It is not a
 * medical figure and nothing here diagnoses anything.
 *
 * Pure: readings in, score out.
 */

export type Grade = 'bad' | 'poor' | 'ok' | 'good' | 'great';

/** The face for each grade. */
export const GRADE_EMOJI: Record<Grade, string> = {
  bad: '💩',
  poor: '😞',
  ok: '😐',
  good: '👍',
  great: '👍👍',
};

export const GRADE_LABEL: Record<Grade, string> = {
  bad: 'Rough',
  poor: 'Not great',
  ok: 'OK',
  good: 'Good',
  great: 'Primed',
};

export type Readiness =
  | {
      status: 'scored';
      /** 0-100. An estimate, and labelled as one wherever it is shown. */
      score: number;
      grade: Grade;
      /** Plain sentences naming what moved the score. */
      reasons: string[];
    }
  | { status: 'not-enough-data'; missing: string[] };

export type RestQuality =
  | {
      status: 'scored';
      grade: Grade;
      minutes: number;
      /** The night's sleep against the target, as a fraction. */
      ratio: number;
      note: string;
    }
  | { status: 'not-enough-data'; missing: string[] };

/**
 * Sleep needed per night. Seven hours is the low end of the adult range most
 * guidance agrees on; the user can change it.
 */
export const DEFAULT_SLEEP_TARGET_MIN = 7 * 60;

export function gradeFromScore(score: number): Grade {
  if (score < 25) return 'bad';
  if (score < 45) return 'poor';
  if (score < 65) return 'ok';
  if (score < 85) return 'good';
  return 'great';
}

/**
 * Rest quality from last night's sleep.
 *
 * Graded on how close the night came to the target. Long sleep is not scored
 * above target — twelve hours is not better than eight, and pretending it is
 * would reward the wrong thing.
 */
export function restQuality(
  sleepMinutes: number | null,
  targetMinutes = DEFAULT_SLEEP_TARGET_MIN
): RestQuality {
  // Zero is not a night, it is a night nobody recorded. Nobody sleeps zero
  // minutes, so a 0 arriving here means the watch was off — and grading that
  // as the worst possible rest is the app inventing a measurement and then
  // judging the user for it. The provider is fixed not to produce one, and this
  // refuses to score it whatever the source.
  if (sleepMinutes == null || sleepMinutes <= 0) {
    return { status: 'not-enough-data', missing: ['sleep'] };
  }
  const target = targetMinutes > 0 ? targetMinutes : DEFAULT_SLEEP_TARGET_MIN;
  const ratio = sleepMinutes / target;

  let grade: Grade;
  if (ratio < 0.55) grade = 'bad';
  else if (ratio < 0.75) grade = 'poor';
  else if (ratio < 0.9) grade = 'ok';
  else if (ratio < 1.15) grade = 'great';
  else grade = 'good'; // well over target: fine, but not better than on target

  const h = Math.floor(sleepMinutes / 60);
  const m = Math.round(sleepMinutes % 60);
  const note =
    grade === 'good' && ratio >= 1.15
      ? `${h}h ${m}m — well over your ${Math.round(target / 60)}h target`
      : `${h}h ${m}m of ${Math.round(target / 60)}h`;

  return { status: 'scored', grade, minutes: sleepMinutes, ratio, note };
}

export type ReadinessInput = {
  /** Last night. */
  sleepMinutes: number | null;
  /** Today's resting heart rate. */
  restingHr: number | null;
  /** The user's own baseline, averaged over previous days. */
  baselineRestingHr: number | null;
  /** Sets completed in the last 48 hours, as a load signal. */
  recentSets: number | null;
  sleepTargetMinutes?: number;
};

/**
 * A readiness estimate from sleep and resting heart rate, nudged by recent
 * training load.
 *
 * Sleep is the largest term because it is the signal with the best evidence
 * behind it and the one the phone measures most reliably. Resting heart rate
 * counts only against the user's own baseline — an absolute number says
 * nothing without knowing whose heart it is.
 *
 * Needs at least sleep. Without it there is no estimate, and it says so rather
 * than scoring on heart rate alone.
 */
export function readiness(input: ReadinessInput): Readiness {
  const missing: string[] = [];
  // Zero minutes is an absent reading, not a sleepless night. See restQuality.
  const slept = input.sleepMinutes != null && input.sleepMinutes > 0 ? input.sleepMinutes : null;
  if (slept == null) missing.push('sleep');
  if (input.restingHr == null) missing.push('resting heart rate');
  if (slept == null) {
    return { status: 'not-enough-data', missing };
  }

  const target = input.sleepTargetMinutes ?? DEFAULT_SLEEP_TARGET_MIN;
  const reasons: string[] = [];

  // Sleep: 0-70 points, flat once the target is met, and curved so a short
  // night actually costs something. Scored linearly, four hours came out as
  // "OK", which it is not.
  const sleepRatio = Math.min(1.2, slept / target);
  const capped = Math.min(1, sleepRatio);
  const sleepPoints = Math.round(capped * capped * 70);
  const hours = (slept / 60).toFixed(1);
  reasons.push(
    sleepRatio >= 0.95
      ? `${hours}h sleep, on target`
      : `${hours}h sleep, under your ${Math.round(target / 60)}h target`
  );

  // Resting heart rate against the user's baseline: -20 to +20.
  let hrPoints = 0;
  if (input.restingHr != null && input.baselineRestingHr != null && input.baselineRestingHr > 0) {
    const delta = input.restingHr - input.baselineRestingHr;
    // Roughly four points per beat, capped, so one odd reading cannot swamp it.
    hrPoints = Math.max(-20, Math.min(20, Math.round(-delta * 4)));
    if (delta >= 3) reasons.push(`resting heart rate ${Math.round(delta)} bpm above your usual`);
    else if (delta <= -3) reasons.push(`resting heart rate ${Math.round(-delta)} bpm below your usual`);
    else reasons.push('resting heart rate at your usual');
  } else if (input.restingHr == null) {
    reasons.push('no resting heart rate today — sleep only');
  } else {
    reasons.push('no baseline heart rate yet, so it is not counted');
  }

  // Recent training load: up to -15 for a heavy couple of days.
  let loadPoints = 0;
  if (input.recentSets != null && input.recentSets > 0) {
    if (input.recentSets >= 60) {
      loadPoints = -15;
      reasons.push(`${input.recentSets} sets in the last two days`);
    } else if (input.recentSets >= 35) {
      loadPoints = -8;
      reasons.push(`${input.recentSets} sets in the last two days`);
    }
  }

  let total = Math.max(0, Math.min(100, 15 + sleepPoints + hrPoints + loadPoints));

  // Sleep alone cannot reach the top of the scale. Without a heart-rate
  // baseline to compare against there is not enough signal to call someone
  // primed, so a well-slept night with nothing else caps at "good".
  const hasBaseline = input.restingHr != null && input.baselineRestingHr != null;
  if (!hasBaseline) total = Math.min(total, 80);

  return { status: 'scored', score: total, grade: gradeFromScore(total), reasons };
}
