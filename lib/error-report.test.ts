import { describe, expect, it } from 'vitest';
import { errorMessage, errorReport } from './error-report';

const at = new Date(Date.UTC(2026, 9, 5, 21, 0));

describe('error report', () => {
  it('names the build, screen and error, and nothing else', () => {
    const e = new TypeError('cannot read weight of undefined');
    const r = errorReport({ error: e, where: '/train/active', build: 'v0.1.0-alpha.47', platform: 'android', at });
    expect(r).toContain('Build: v0.1.0-alpha.47 (android)');
    expect(r).toContain('Screen: /train/active');
    expect(r).toContain('Error: TypeError: cannot read weight of undefined');
    expect(r).toContain('When: 2026-10-05T21:00:00.000Z');
  });

  it('says so when it is a dev build or the screen is unknown', () => {
    const r = errorReport({ error: 'boom', where: null, build: null, platform: 'ios', at });
    expect(r).toContain('Build: development build (ios)');
    expect(r).toContain('Screen: unknown');
    expect(r).toContain('Error: boom');
  });

  it('keeps a long stack to a readable length', () => {
    const e = new Error('deep');
    e.stack = ['Error: deep', ...Array.from({ length: 100 }, (_, i) => `    at f${i}`)].join('\n');
    const r = errorReport({ error: e, where: '/', build: null, platform: 'android', at });
    expect(r.split('\n').filter((l) => l.startsWith('    at f')).length).toBeLessThanOrEqual(29);
  });

  it('reads odd throwables without throwing itself', () => {
    expect(errorMessage({ code: 42 })).toBe('{"code":42}');
    expect(errorMessage(new Error(''))).toBe('Error');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(typeof errorMessage(circular)).toBe('string');
  });
});
