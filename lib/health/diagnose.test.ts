import { describe, expect, it } from 'vitest';
import { describeError, formatReport } from './diagnose';

describe('turning a failure into something readable', () => {
  it('uses the message when there is one', () => {
    expect(describeError(new Error('SDK unavailable'))).toBe('SDK unavailable');
  });

  it('never returns an empty string for an Error with no message', () => {
    // "ok  initialize: " in a report tells nobody anything.
    expect(describeError(new Error(''))).toBe('Error');
    expect(describeError(new TypeError(''))).toBe('TypeError');
  });

  it('handles the non-Error things native modules actually throw', () => {
    expect(describeError('boom')).toBe('boom');
    expect(describeError({ code: 42 })).toBe('{"code":42}');
    expect(describeError({})).toBe('threw a non-Error value');
    expect(describeError(null)).toBe('threw a non-Error value');
    expect(describeError(undefined)).toBe('threw a non-Error value');
  });

  it('survives something that cannot be stringified', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(describeError(cyclic)).toBe('threw a value that could not be described');
  });
});

describe('the copyable report', () => {
  it('marks each line so a screenshot is readable at a glance', () => {
    const text = formatReport([
      { label: 'SDK status', value: 'available', ok: true },
      { label: 'initialize()', value: 'returned false', ok: false },
      { label: 'Range', value: 'today', ok: null },
    ]);
    expect(text).toBe('ok  SDK status: available\nXX  initialize(): returned false\n·  Range: today');
  });

  it('is empty rather than throwing when there is nothing to report', () => {
    expect(formatReport([])).toBe('');
  });
});
