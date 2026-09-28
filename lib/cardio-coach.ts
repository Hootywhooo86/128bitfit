/**
 * The cardio part of the coach's pre-computed summary.
 *
 * Plain lines of text, a few hundred characters at most, so the coach can say
 * "you walked 14 km this fortnight, up from 9" without being handed every GPS
 * fix. The same rules as the rest of the summary: counts and totals it can
 * trust, a trend only when there is enough on both sides to compare, and a
 * plain "none yet" rather than zeros that look like data.
 *
 * Pure, so it is tested.
 */
import { METRES_PER, formatDuration, formatPace, formatSpeed, sportById, type DistanceUnit } from './cardio';

export type CardioForCoach = {
  sport: string;
  startedAt: number;
  distanceM: number | null;
  movingS: number | null;
  elevGainM: number | null;
  manual: boolean;
};

const DAY = 86_400_000;

/** A trend needs this many sessions in each fortnight, or it is noise. */
const MIN_FOR_TREND = 2;

function dist(m: number, unit: DistanceUnit): string {
  return `${(m / METRES_PER[unit]).toFixed(1)} ${unit}`;
}

/** "Walk, 3.2 km in 41:10 (12:52 /km), 20 m climb, typed in" */
export function describeCardio(s: CardioForCoach, unit: DistanceUnit): string {
  const sport = sportById(s.sport);
  const bits: string[] = [];
  if (s.distanceM != null && s.distanceM > 0) bits.push(dist(s.distanceM, unit));
  if (s.movingS != null && s.movingS > 0) bits.push(`in ${formatDuration(s.movingS)}`);
  let line = `${sport.label}${bits.length ? `, ${bits.join(' ')}` : ''}`;
  if (s.distanceM != null && s.distanceM >= 50 && s.movingS) {
    line += sport.showSpeed
      ? ` (${formatSpeed(s.distanceM / s.movingS, unit)} ${unit === 'mi' ? 'mph' : 'km/h'} avg)`
      : ` (${formatPace(s.movingS / (s.distanceM / METRES_PER[unit]))} /${unit} avg)`;
  }
  if (s.elevGainM != null && s.elevGainM >= 5) line += `, ${Math.round(s.elevGainM)} m climb`;
  if (s.manual) line += ', typed in by hand';
  return line;
}

function total(list: readonly CardioForCoach[]) {
  return {
    n: list.length,
    m: list.reduce((a, s) => a + (s.distanceM ?? 0), 0),
    s: list.reduce((a, s) => a + (s.movingS ?? 0), 0),
  };
}

/**
 * @param sessions Finished sessions, any order.
 * @param focus    A session to debrief in detail (the one the user asked about).
 */
export function cardioCoachLines(
  sessions: readonly CardioForCoach[],
  unit: DistanceUnit,
  now: number,
  focus?: CardioForCoach | null
): string[] {
  const lines: string[] = [];
  if (focus) {
    lines.push(
      'Debrief THIS cardio session (the user asked about it):',
      `- ${new Date(focus.startedAt).toISOString()}: ${describeCardio(focus, unit)}`,
      ''
    );
  }
  const recent = sessions.filter((s) => now - s.startedAt <= 28 * DAY);
  if (recent.length === 0) {
    lines.push('Cardio (last 28 days): none logged');
    return lines;
  }
  const t = total(recent);
  lines.push(
    'Cardio (last 28 days):',
    `- ${t.n} session${t.n === 1 ? '' : 's'}, ${dist(t.m, unit)}, ${formatDuration(t.s)} moving`
  );
  const bySport = new Map<string, CardioForCoach[]>();
  for (const s of recent) bySport.set(s.sport, [...(bySport.get(s.sport) ?? []), s]);
  if (bySport.size > 1) {
    lines.push(
      `- By sport: ${[...bySport.entries()]
        .map(([id, list]) => `${sportById(id).label} ×${list.length} (${dist(total(list).m, unit)})`)
        .join(', ')}`
    );
  }
  const newest = [...recent].sort((a, b) => b.startedAt - a.startedAt)[0];
  lines.push(`- Most recent: ${new Date(newest.startedAt).toISOString()}: ${describeCardio(newest, unit)}`);

  const thisFortnight = recent.filter((s) => now - s.startedAt <= 14 * DAY);
  const lastFortnight = recent.filter((s) => now - s.startedAt > 14 * DAY);
  if (thisFortnight.length >= MIN_FOR_TREND && lastFortnight.length >= MIN_FOR_TREND) {
    const a = total(thisFortnight);
    const b = total(lastFortnight);
    lines.push(
      `- Last 14 days vs the 14 before: ${dist(a.m, unit)} vs ${dist(b.m, unit)}, ${a.n} vs ${b.n} sessions`
    );
  } else {
    lines.push('- Not enough sessions in both fortnights yet to call a trend');
  }
  return lines;
}
