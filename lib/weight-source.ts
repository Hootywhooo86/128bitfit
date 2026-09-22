/**
 * Which weight to show, and where it came from.
 *
 * The app is not the only thing that records a weigh-in. A smart scale writes
 * straight to Health Connect and never touches this app, so a user who steps on
 * one and then opens Home would see "Log your first weigh-in" over a reading
 * their phone already has. That is the same class of dishonesty as showing a
 * zero for a missing measurement: the app is claiming to know nothing while the
 * data sits one API call away.
 *
 * So both are read, the newer one wins, and the source is carried along — a
 * figure from the user's scale and one they typed in are different facts and
 * the UI says which it is.
 *
 * Pure: readings in, choice out.
 */

export type WeightSource = 'app' | 'health';

export type WeightReading = {
  kg: number;
  /** Epoch milliseconds. */
  at: number;
};

export type LatestWeight =
  | { status: 'none' }
  | { status: 'have'; kg: number; at: number; source: WeightSource };

const usable = (r: WeightReading | null | undefined): r is WeightReading =>
  r != null && Number.isFinite(r.kg) && r.kg > 0 && Number.isFinite(r.at);

/**
 * The most recent of the two.
 *
 * A tie goes to the app's own entry: if both carry the same timestamp it is
 * almost always our own write mirrored into Health Connect and read straight
 * back, and calling that "from Health Connect" would be a small lie.
 */
export function latestWeight(
  local: WeightReading | null | undefined,
  fromHealth: WeightReading | null | undefined
): LatestWeight {
  const a = usable(local) ? local : null;
  const b = usable(fromHealth) ? fromHealth : null;
  if (!a && !b) return { status: 'none' };
  if (a && (!b || a.at >= b.at)) return { status: 'have', kg: a.kg, at: a.at, source: 'app' };
  return { status: 'have', kg: b!.kg, at: b!.at, source: 'health' };
}

export const KG_PER_LB = 0.453592;

/** Kilograms rendered in whichever unit the user picked. */
export function formatKg(kg: number, unit: 'kg' | 'lb'): string {
  const n = unit === 'kg' ? kg : kg / KG_PER_LB;
  return `${Math.round(n * 10) / 10} ${unit}`;
}
