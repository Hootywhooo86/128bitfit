import { describe, expect, it } from 'vitest';
import { shouldKeepAwake } from './session-awake';

describe('shouldKeepAwake', () => {
  it('holds the screen for a running session', () => {
    expect(shouldKeepAwake(true, 'in_progress')).toBe(true);
  });

  it('lets go the moment the workout ends, however it ended', () => {
    // Finishing and discarding are both endings. A screen still lit after
    // either is a battery drain nobody can trace back to its cause.
    expect(shouldKeepAwake(true, 'completed')).toBe(false);
    expect(shouldKeepAwake(true, 'discarded')).toBe(false);
  });

  it('holds nothing when there is no session', () => {
    expect(shouldKeepAwake(true, null)).toBe(false);
    expect(shouldKeepAwake(true, undefined)).toBe(false);
  });

  it('respects the setting being off, even mid-workout', () => {
    expect(shouldKeepAwake(false, 'in_progress')).toBe(false);
  });
});
