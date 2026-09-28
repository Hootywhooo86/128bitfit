import { describe, expect, it } from 'vitest';
import { cardioCoachLines, describeCardio, type CardioForCoach } from './cardio-coach';

const NOW = Date.UTC(2026, 8, 28, 12);
const DAY = 86_400_000;
const s = (daysAgo: number, over: Partial<CardioForCoach> = {}): CardioForCoach => ({
  sport: 'walk',
  startedAt: NOW - daysAgo * DAY,
  distanceM: 3200,
  movingS: 2470,
  elevGainM: 20,
  manual: false,
  ...over,
});

describe('describing one session for the coach', () => {
  it('gives distance, time, pace and climb in the chosen unit', () => {
    expect(describeCardio(s(0), 'km')).toBe('Walk, 3.2 km in 41:10 (12:52 /km avg), 20 m climb');
  });

  it('gives speed for cycling, and flags a typed-in session', () => {
    expect(describeCardio(s(0, { sport: 'indoor_ride', distanceM: 20000, movingS: 3600, elevGainM: null, manual: true }), 'mi')).toBe(
      'Indoor Ride, 12.4 mi in 1:00:00 (12.4 mph avg), typed in by hand'
    );
  });

  it('leaves out what was not recorded rather than printing zeros', () => {
    expect(describeCardio(s(0, { distanceM: null, elevGainM: 2 }), 'km')).toBe('Walk, in 41:10');
  });
});

describe('the cardio block of the coach summary', () => {
  it('says plainly when there is no cardio', () => {
    expect(cardioCoachLines([s(40)], 'km', NOW)).toEqual(['Cardio (last 28 days): none logged']);
  });

  it('totals the last four weeks and names the most recent', () => {
    const lines = cardioCoachLines([s(1), s(3, { sport: 'run', distanceM: 5000, movingS: 1650 })], 'km', NOW);
    expect(lines[1]).toBe('- 2 sessions, 8.2 km, 1:08:40 moving');
    expect(lines[2]).toBe('- By sport: Walk ×1 (3.2 km), Run ×1 (5.0 km)');
    expect(lines[3]).toMatch(/^- Most recent: 2026-09-27T12:00:00.000Z: Walk/);
  });

  it('only calls a trend with enough on both sides', () => {
    expect(cardioCoachLines([s(1), s(2), s(20)], 'km', NOW).at(-1)).toBe(
      '- Not enough sessions in both fortnights yet to call a trend'
    );
    expect(cardioCoachLines([s(1), s(2), s(20), s(21, { distanceM: 1000 })], 'km', NOW).at(-1)).toBe(
      '- Last 14 days vs the 14 before: 6.4 km vs 4.2 km, 2 vs 2 sessions'
    );
  });

  it('puts the session being asked about first', () => {
    const lines = cardioCoachLines([s(0)], 'km', NOW, s(0));
    expect(lines[0]).toBe('Debrief THIS cardio session (the user asked about it):');
    expect(lines[1]).toContain('Walk, 3.2 km');
  });
});
