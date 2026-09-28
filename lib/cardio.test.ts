import { describe, expect, it } from 'vitest';
import {
  cardioStats,
  cleanFixes,
  distanceUnitFor,
  elevationGain,
  formatDistance,
  formatDuration,
  formatPace,
  formatSpeed,
  haversine,
  paceFromSpeed,
  searchSports,
  sportById,
  toGpx,
  type Fix,
} from './cardio';

const M_PER_DEG_LAT = (Math.PI / 180) * 6_371_008.8;
const T0 = Date.UTC(2026, 8, 28, 12, 0, 0);

/** Due north at `speed` m/s, one fix a second, starting at `start` seconds. */
function walk(seconds: number, speed: number, opts: Partial<Fix> & { start?: number; fromM?: number } = {}): Fix[] {
  const { start = 0, fromM = 0, ...rest } = opts;
  return Array.from({ length: seconds + 1 }, (_, i) => ({
    t: T0 + (start + i) * 1000,
    lat: 51 + (fromM + speed * i) / M_PER_DEG_LAT,
    lon: -114,
    alt: null,
    accuracy: 5,
    segment: 0,
    ...rest,
  }));
}

const WALK = sportById('walk');
const RUN = sportById('run');
const RIDE = sportById('ride');

describe('haversine', () => {
  it('measures a degree of latitude', () => {
    expect(haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(M_PER_DEG_LAT, 0);
  });
  it('is zero for the same place', () => {
    expect(haversine({ lat: 51, lon: -114 }, { lat: 51, lon: -114 })).toBe(0);
  });
});

describe('cleaning fixes', () => {
  it('drops fixes the phone rates worse than 30 m', () => {
    const fixes = walk(10, 1.4);
    fixes[5] = { ...fixes[5], accuracy: 65 };
    expect(cleanFixes(fixes, WALK)).toHaveLength(10);
  });

  it('drops a jump faster than the sport allows, and keeps going after it', () => {
    const fixes = walk(10, 1.4);
    fixes[4] = { ...fixes[4], lat: fixes[4].lat + 300 / M_PER_DEG_LAT };
    const kept = cleanFixes(fixes, WALK);
    expect(kept).toHaveLength(10);
    expect(kept.map((f) => f.t)).not.toContain(fixes[4].t);
  });

  it('allows a cyclist the speed a walker could not reach', () => {
    const fixes = walk(10, 12);
    expect(cleanFixes(fixes, WALK).length).toBeLessThan(11);
    expect(cleanFixes(fixes, RIDE)).toHaveLength(11);
  });

  it('keeps fixes with no accuracy reported', () => {
    expect(cleanFixes(walk(3, 1.4, { accuracy: null }), WALK)).toHaveLength(4);
  });
});

describe('distance, time and pace', () => {
  it('adds up a steady walk', () => {
    const s = cardioStats(walk(600, 1.5), WALK, { autoPause: true, unit: 'km' });
    expect(s.distanceM).toBeCloseTo(900, 0);
    expect(s.movingS).toBe(600);
    // 1.5 m/s is 11:07 per km.
    expect(s.avgPace).toBeCloseTo(666.7, 0);
    expect(formatPace(s.avgPace)).toBe('11:07');
    expect(s.currentSpeed).toBeCloseTo(1.5, 2);
  });

  it('shows no pace until there is enough movement to mean anything', () => {
    const s = cardioStats(walk(10, 1.5), WALK, { autoPause: true, unit: 'km' });
    expect(s.avgPace).toBeNull();
    expect(s.avgSpeed).toBeNull();
    expect(cardioStats([], WALK, { autoPause: true, unit: 'km' })).toMatchObject({
      distanceM: 0,
      movingS: 0,
      avgPace: null,
      currentSpeed: null,
      elevGainM: null,
      splits: [],
    });
  });

  it('auto-pause leaves standing still out of the moving time', () => {
    const moving = walk(120, 1.5);
    const last = moving[moving.length - 1];
    const standing = Array.from({ length: 60 }, (_, i) => ({ ...last, t: last.t + (i + 1) * 1000 }));
    const s = cardioStats([...moving, ...standing], WALK, { autoPause: true, unit: 'km' });
    expect(s.movingS).toBe(120);
    const off = cardioStats([...moving, ...standing], WALK, { autoPause: false, unit: 'km' });
    expect(off.movingS).toBe(180);
    // Either way, standing still adds no distance.
    expect(off.distanceM).toBeCloseTo(s.distanceM, 6);
    expect(s.currentSpeed).toBeNull();
  });

  it('draws nothing across a manual pause', () => {
    const before = walk(60, 1.5);
    const after = walk(60, 1.5, { start: 600, fromM: 2000, segment: 1 });
    const s = cardioStats([...before, ...after], WALK, { autoPause: true, unit: 'km' });
    expect(s.distanceM).toBeCloseTo(180, 0);
    expect(s.movingS).toBe(120);
  });

  it('does not count lost signal as moving time', () => {
    const a = walk(30, 1.5);
    const b = walk(30, 1.5, { start: 200, fromM: 45 + 300 });
    const s = cardioStats([...a, ...b], WALK, { autoPause: false, unit: 'km' });
    expect(s.movingS).toBe(60);
  });
});

describe('splits', () => {
  it('closes each whole kilometre and keeps the part-done one', () => {
    // 3.1 m/s for 800 s = 2480 m.
    const s = cardioStats(walk(800, 3.1), RUN, { autoPause: true, unit: 'km' });
    expect(s.splits.map((x) => Math.round(x.distanceM))).toEqual([1000, 1000, 480]);
    expect(s.splits[0].movingS).toBeCloseTo(1000 / 3.1, 0);
    expect(s.splits.reduce((t, x) => t + x.movingS, 0)).toBeCloseTo(800, 3);
  });

  it('splits by the mile when the unit is miles', () => {
    const s = cardioStats(walk(1200, 3), RUN, { autoPause: true, unit: 'mi' });
    expect(s.splits).toHaveLength(3);
    expect(s.splits[0].distanceM).toBeCloseTo(1609.344, 3);
  });
});

describe('elevation gain', () => {
  const at = (alt: number, i: number): Fix => ({ t: T0 + i * 1000, lat: 51, lon: -114, alt, accuracy: 5, segment: 0 });

  it('counts climbing, not descending', () => {
    expect(elevationGain([100, 110, 120, 100, 130].map(at))).toBe(50);
  });

  it('ignores altitude wobble inside the hysteresis', () => {
    expect(elevationGain([100, 102, 99, 103, 100, 102].map(at))).toBe(0);
  });

  it('is unknown when the phone gives no altitude', () => {
    expect(elevationGain(walk(5, 1))).toBeNull();
  });
});

describe('formatting', () => {
  it('formats durations', () => {
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(600)).toBe('10:00');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(formatDuration(-4)).toBe('0:00');
  });

  it('shows a dash rather than a fake pace', () => {
    expect(formatPace(null)).toBe('–:––');
    expect(formatPace(0)).toBe('–:––');
    expect(formatPace(5000)).toBe('–:––');
    expect(formatPace(332)).toBe('5:32');
  });

  it('converts speed and distance units', () => {
    expect(formatSpeed(5, 'km')).toBe('18.0');
    expect(formatSpeed(null, 'mi')).toBe('–');
    expect(formatDistance(1609.344, 'mi')).toBe('1.00');
    expect(formatDistance(2410, 'km')).toBe('2.41');
    expect(paceFromSpeed(2.5, 'km')).toBe(400);
    expect(paceFromSpeed(0, 'km')).toBeNull();
  });

  it('follows the app unit: pounds go with miles', () => {
    expect(distanceUnitFor('lb')).toBe('mi');
    expect(distanceUnitFor('kg')).toBe('km');
  });
});

describe('sports', () => {
  it('finds sports by name and falls back to Walk for an unknown id', () => {
    expect(searchSports('ride').map((s) => s.id)).toEqual(['ride', 'mtb', 'gravel', 'ebike', 'indoor_ride']);
    expect(searchSports('  ').length).toBeGreaterThan(8);
    expect(sportById('nope').id).toBe('walk');
  });

  it('marks indoor sports as having no route', () => {
    expect(sportById('treadmill').gps).toBe(false);
    expect(sportById('ride').showSpeed).toBe(true);
    expect(sportById('run').showSpeed).toBe(false);
  });
});

describe('GPX export', () => {
  it('writes each pause-separated stretch as its own segment', () => {
    const gpx = toGpx({ name: 'Walk <evening>', startedAt: T0 }, [
      ...walk(1, 1.5),
      ...walk(1, 1.5, { start: 100, segment: 1, alt: 1045.25 }),
    ]);
    expect(gpx.match(/<trkseg>/g)).toHaveLength(2);
    expect(gpx.match(/<trkpt /g)).toHaveLength(4);
    expect(gpx).toContain('<name>Walk &lt;evening&gt;</name>');
    expect(gpx).toContain('<ele>1045.3</ele>');
    expect(gpx).toContain(`<time>${new Date(T0).toISOString()}</time>`);
  });
});
