import { describe, expect, it } from 'vitest';
import { formatKg, latestWeight } from './weight-source';

const app = { kg: 80, at: 1000 };
const scale = { kg: 79.2, at: 2000 };

/** Which side won, or 'none'. */
const src = (r: ReturnType<typeof latestWeight>) => (r.status === 'have' ? r.source : 'none');

describe('latestWeight', () => {
  it('has nothing when neither source does', () => {
    expect(latestWeight(null, null)).toEqual({ status: 'none' });
  });

  it('uses the only reading there is, whichever side it is on', () => {
    expect(latestWeight(app, null)).toEqual({ status: 'have', kg: 80, at: 1000, source: 'app' });
    expect(latestWeight(null, scale)).toEqual({
      status: 'have',
      kg: 79.2,
      at: 2000,
      source: 'health',
    });
  });

  it('prefers the newer reading', () => {
    expect(src(latestWeight(app, scale))).toBe('health');
    expect(src(latestWeight({ kg: 81, at: 3000 }, scale))).toBe('app');
  });

  it('calls a tie the app, since that is our own write read back', () => {
    expect(src(latestWeight({ kg: 80, at: 2000 }, scale))).toBe('app');
  });

  it('ignores a reading that is not a usable weight', () => {
    expect(src(latestWeight({ kg: 0, at: 5000 }, scale))).toBe('health');
    expect(src(latestWeight({ kg: Number.NaN, at: 5000 }, scale))).toBe('health');
    expect(src(latestWeight(app, { kg: -1, at: 9000 }))).toBe('app');
    expect(latestWeight({ kg: 80, at: Number.NaN }, null)).toEqual({ status: 'none' });
  });
});

describe('formatKg', () => {
  it('leaves kilograms alone', () => {
    expect(formatKg(82.46, 'kg')).toBe('82.5 kg');
  });

  it('converts to pounds', () => {
    expect(formatKg(80, 'lb')).toBe('176.4 lb');
  });
});
