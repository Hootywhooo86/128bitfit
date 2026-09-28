/**
 * Outdoor cardio: the sports, and the maths that turns GPS fixes into a
 * distance, a time, a pace and splits.
 *
 * Pure. Fixes in, numbers out, so every rule here is tested without a phone.
 *
 * The honesty rules from CLAUDE.md apply as everywhere else: a pace is only
 * shown once there is enough movement to compute one (never a fake "0:00"),
 * and a fix the phone itself says is poor is dropped rather than drawn as a
 * detour through someone's house.
 */

export type SportGroup = 'foot' | 'cycle' | 'indoor';

export type SportId =
  | 'run'
  | 'trail_run'
  | 'walk'
  | 'hike'
  | 'wheelchair'
  | 'ride'
  | 'mtb'
  | 'gravel'
  | 'ebike'
  | 'treadmill'
  | 'indoor_ride';

export type Sport = {
  id: SportId;
  label: string;
  group: SportGroup;
  /** Two letters in the pixel font, in place of a picture icon. */
  badge: string;
  /** False for indoor sports: entered by hand, no route. */
  gps: boolean;
  /** Cycling reads as km/h or mph; on foot, as time per km or mile. */
  showSpeed: boolean;
  /** Faster than this between two fixes is a GPS jump, not the athlete. m/s. */
  maxSpeed: number;
  /** Slower than this is standing still, for auto-pause. m/s. */
  stopSpeed: number;
  /** Health Connect ExerciseSessionRecord type. */
  healthType: number;
};

export const SPORTS: readonly Sport[] = [
  { id: 'run', label: 'Run', group: 'foot', badge: 'RN', gps: true, showSpeed: false, maxSpeed: 12, stopSpeed: 0.8, healthType: 56 },
  { id: 'trail_run', label: 'Trail Run', group: 'foot', badge: 'TR', gps: true, showSpeed: false, maxSpeed: 12, stopSpeed: 0.6, healthType: 56 },
  { id: 'walk', label: 'Walk', group: 'foot', badge: 'WK', gps: true, showSpeed: false, maxSpeed: 4, stopSpeed: 0.4, healthType: 79 },
  { id: 'hike', label: 'Hike', group: 'foot', badge: 'HK', gps: true, showSpeed: false, maxSpeed: 4, stopSpeed: 0.3, healthType: 37 },
  { id: 'wheelchair', label: 'Wheelchair', group: 'foot', badge: 'WC', gps: true, showSpeed: false, maxSpeed: 12, stopSpeed: 0.4, healthType: 82 },
  { id: 'ride', label: 'Ride', group: 'cycle', badge: 'RD', gps: true, showSpeed: true, maxSpeed: 25, stopSpeed: 1.2, healthType: 8 },
  { id: 'mtb', label: 'Mountain Bike Ride', group: 'cycle', badge: 'MB', gps: true, showSpeed: true, maxSpeed: 25, stopSpeed: 0.8, healthType: 8 },
  { id: 'gravel', label: 'Gravel Ride', group: 'cycle', badge: 'GR', gps: true, showSpeed: true, maxSpeed: 25, stopSpeed: 1, healthType: 8 },
  { id: 'ebike', label: 'E-Bike Ride', group: 'cycle', badge: 'EB', gps: true, showSpeed: true, maxSpeed: 25, stopSpeed: 1.2, healthType: 8 },
  { id: 'treadmill', label: 'Treadmill', group: 'indoor', badge: 'TM', gps: false, showSpeed: false, maxSpeed: 12, stopSpeed: 0, healthType: 57 },
  { id: 'indoor_ride', label: 'Indoor Ride', group: 'indoor', badge: 'IR', gps: false, showSpeed: true, maxSpeed: 25, stopSpeed: 0, healthType: 9 },
];

export const SPORT_GROUPS: readonly { id: SportGroup; label: string }[] = [
  { id: 'foot', label: 'On foot' },
  { id: 'cycle', label: 'Cycling' },
  { id: 'indoor', label: 'Indoor' },
];

export const DEFAULT_SPORT: SportId = 'walk';

export function sportById(id: string | null | undefined): Sport {
  return SPORTS.find((s) => s.id === id) ?? SPORTS.find((s) => s.id === DEFAULT_SPORT)!;
}

/** Search the sport list by name, as the picker's search box does. */
export function searchSports(query: string): Sport[] {
  const q = query.trim().toLowerCase();
  return q ? SPORTS.filter((s) => s.label.toLowerCase().includes(q)) : [...SPORTS];
}

// ---------------------------------------------------------------------------
// Fixes

export type Fix = {
  /** ms since epoch */
  t: number;
  lat: number;
  lon: number;
  alt: number | null;
  /** Horizontal accuracy radius in metres, as the phone reports it. */
  accuracy: number | null;
  /** Manual pause starts a new segment; no distance is drawn across the gap. */
  segment: number;
  /**
   * Speed the phone itself reports, m/s. It comes from the GPS Doppler shift,
   * not from comparing positions, so it stays steady when the position
   * wobbles by metres — which on a walk is as much as the walk itself.
   */
  speed?: number | null;
};

/**
 * A fix vaguer than this is not drawn or counted. Phones routinely report
 * 25–35 m in a suburb; 30 dropped too many real fixes on a first walk test.
 */
export const MAX_ACCURACY_M = 40;

/** "GPS acquired" once a fix is at least this good. */
export const GOOD_FIX_M = 25;

/** Current speed from the phone's own reading averages over this many seconds. */
export const REPORTED_SPEED_WINDOW_S = 8;

const EARTH_RADIUS_M = 6_371_008.8;

/** Great-circle distance in metres. */
export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The fixes worth keeping, in time order.
 *
 * Drops any the phone itself rates worse than MAX_ACCURACY_M, and any that
 * would mean moving faster than the sport allows since the last kept fix —
 * the classic GPS jump across a block and back.
 */
export function cleanFixes(fixes: readonly Fix[], sport: Sport): Fix[] {
  const sorted = [...fixes].sort((a, b) => a.t - b.t);
  const out: Fix[] = [];
  for (const f of sorted) {
    if (!Number.isFinite(f.lat) || !Number.isFinite(f.lon)) continue;
    if (f.accuracy != null && f.accuracy > MAX_ACCURACY_M) continue;
    const prev = out[out.length - 1];
    if (prev && prev.segment === f.segment) {
      const dt = (f.t - prev.t) / 1000;
      if (dt <= 0) continue;
      if (haversine(prev, f) / dt > sport.maxSpeed * 1.5) continue;
    }
    out.push(f);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stats

export type DistanceUnit = 'km' | 'mi';

export const METRES_PER: Record<DistanceUnit, number> = { km: 1000, mi: 1609.344 };

export type Split = {
  /** 1-based. */
  n: number;
  /** A full unit, or less for the last, unfinished one. */
  distanceM: number;
  movingS: number;
};

export type CardioStats = {
  distanceM: number;
  movingS: number;
  elevGainM: number | null;
  /** Seconds per km or mile; null until there is enough to say. */
  avgPace: number | null;
  /** m/s; null until there is enough to say. */
  avgSpeed: number | null;
  /**
   * m/s now: the phone's reported speed over the last few seconds, else
   * position change over the last CURRENT_WINDOW_S. 0 means standing still;
   * null means too little to say.
   */
  currentSpeed: number | null;
  splits: Split[];
};

/** How far back "current" pace looks. */
export const CURRENT_WINDOW_S = 30;

/** Less than this and an average pace is noise, so it stays a dash. */
const MIN_DISTANCE_FOR_PACE_M = 50;

/** A gap longer than this between fixes is lost signal: its time is not counted as moving. */
const MAX_GAP_S = 30;

/** Elevation has to move this much before it counts, so GPS altitude noise adds nothing. */
const ELEV_HYSTERESIS_M = 4;

/** Below this, a stretch is GPS jitter around a standing phone, even with auto-pause off. */
const JITTER_SPEED = 0.3;

export function cardioStats(
  raw: readonly Fix[],
  sport: Sport,
  opts: { autoPause: boolean; unit: DistanceUnit }
): CardioStats {
  const fixes = cleanFixes(raw, sport);
  const unitM = METRES_PER[opts.unit];
  let distanceM = 0;
  let movingS = 0;
  const splits: Split[] = [];
  let splitDist = 0;
  let splitTime = 0;

  // For "current" speed: the moving stretches, newest last.
  const recent: { t: number; d: number; dt: number }[] = [];

  for (let i = 1; i < fixes.length; i++) {
    const a = fixes[i - 1];
    const b = fixes[i];
    if (a.segment !== b.segment) continue;
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0 || dt > MAX_GAP_S) continue;
    const d = haversine(a, b);
    const speed = d / dt;
    const stopped = speed < (opts.autoPause ? sport.stopSpeed : JITTER_SPEED);
    if (stopped) {
      // Auto-pause off: standing at a crossing still counts as time, but the
      // wobble of a stationary GPS is not distance.
      if (!opts.autoPause) {
        movingS += dt;
        splitTime += dt;
      }
      continue;
    }
    distanceM += d;
    movingS += dt;
    recent.push({ t: b.t, d, dt });

    // Close off every whole unit this stretch crosses, splitting its time
    // in proportion to where the boundary falls.
    let restD = d;
    let restT = dt;
    while (splitDist + restD >= unitM) {
      const need = unitM - splitDist;
      const frac = need / restD;
      splits.push({ n: splits.length + 1, distanceM: unitM, movingS: splitTime + restT * frac });
      restT -= restT * frac;
      restD -= need;
      splitDist = 0;
      splitTime = 0;
    }
    splitDist += restD;
    splitTime += restT;
  }
  if (splitDist > 1) splits.push({ n: splits.length + 1, distanceM: splitDist, movingS: splitTime });

  const lastT = fixes.length ? fixes[fixes.length - 1].t : 0;
  const window = recent.filter((r) => lastT - r.t <= CURRENT_WINDOW_S * 1000);
  const wT = window.reduce((s, r) => s + r.dt, 0);
  const wD = window.reduce((s, r) => s + r.d, 0);

  const enough = distanceM >= MIN_DISTANCE_FOR_PACE_M && movingS > 0;

  // Current speed: the phone's own reading where it gives one, averaged over
  // a few seconds; otherwise distance over time from the positions.
  const lastSeg = fixes.length ? fixes[fixes.length - 1].segment : 0;
  const reported = fixes.filter(
    (f) =>
      f.segment === lastSeg &&
      lastT - f.t <= REPORTED_SPEED_WINDOW_S * 1000 &&
      f.speed != null &&
      Number.isFinite(f.speed) &&
      f.speed >= 0
  );
  let currentSpeed: number | null = wT >= 5 && wD > 0 ? wD / wT : null;
  if (reported.length >= 2) {
    const avg = reported.reduce((a, f) => a + (f.speed as number), 0) / reported.length;
    // Under the sport's stopping speed is standing still: say so, rather than
    // show a pace of forty minutes a mile.
    currentSpeed = avg < sport.stopSpeed ? 0 : avg;
  }
  return {
    distanceM,
    movingS,
    elevGainM: elevationGain(fixes),
    avgPace: enough ? movingS / (distanceM / unitM) : null,
    avgSpeed: enough ? distanceM / movingS : null,
    currentSpeed,
    splits,
  };
}

/** Climbing only, with hysteresis. Null when the phone gave no altitude at all. */
export function elevationGain(fixes: readonly Fix[]): number | null {
  const alts = fixes.map((f) => f.alt).filter((a): a is number => a != null && Number.isFinite(a));
  if (alts.length < 2) return null;
  let ref = alts[0];
  let gain = 0;
  for (const alt of alts.slice(1)) {
    if (alt - ref >= ELEV_HYSTERESIS_M) {
      gain += alt - ref;
      ref = alt;
    } else if (ref - alt >= ELEV_HYSTERESIS_M) {
      ref = alt;
    }
  }
  return gain;
}

// ---------------------------------------------------------------------------
// Formatting

/** 9 → "0:09", 3723 → "1:02:03". */
export function formatDuration(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** Seconds per unit → "5:32". A pace slower than an hour per unit is not a pace. */
export function formatPace(secPerUnit: number | null): string {
  if (secPerUnit == null || !Number.isFinite(secPerUnit) || secPerUnit <= 0 || secPerUnit >= 3600) return '–:––';
  const s = Math.round(secPerUnit);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** m/s → seconds per km or mile, for a current speed. */
export function paceFromSpeed(speed: number | null, unit: DistanceUnit): number | null {
  return speed != null && speed > 0 ? METRES_PER[unit] / speed : null;
}

/** m/s → "18.4" km/h or mph. */
export function formatSpeed(speed: number | null, unit: DistanceUnit): string {
  if (speed == null || !Number.isFinite(speed)) return '–';
  return ((speed * 3600) / METRES_PER[unit]).toFixed(1);
}

/** Metres → "2.41" km or mi. */
export function formatDistance(m: number, unit: DistanceUnit): string {
  return (m / METRES_PER[unit]).toFixed(2);
}

/** The app's weight unit decides the distance unit: lb goes with miles. */
export function distanceUnitFor(weightUnit: 'kg' | 'lb'): DistanceUnit {
  return weightUnit === 'lb' ? 'mi' : 'km';
}

// ---------------------------------------------------------------------------
// GPX

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * One session as GPX 1.1, the format every other app imports. A manual pause
 * starts a new track segment, so the gap is not drawn as a straight line.
 */
export function toGpx(session: { name: string; startedAt: number }, fixes: readonly Fix[]): string {
  const bySegment = new Map<number, Fix[]>();
  for (const f of [...fixes].sort((a, b) => a.t - b.t)) {
    const list = bySegment.get(f.segment) ?? [];
    list.push(f);
    bySegment.set(f.segment, list);
  }
  const segs = [...bySegment.values()]
    .map(
      (pts) =>
        '    <trkseg>\n' +
        pts
          .map(
            (p) =>
              `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lon.toFixed(7)}">` +
              (p.alt != null ? `<ele>${p.alt.toFixed(1)}</ele>` : '') +
              `<time>${new Date(p.t).toISOString()}</time></trkpt>`
          )
          .join('\n') +
        '\n    </trkseg>'
    )
    .join('\n');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="128BIT FIT" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    `  <metadata><time>${new Date(session.startedAt).toISOString()}</time></metadata>\n` +
    `  <trk>\n    <name>${esc(session.name)}</name>\n${segs}\n  </trk>\n` +
    '</gpx>\n'
  );
}
