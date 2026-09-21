import { describe, expect, it } from 'vitest';
import { serializeCell, toCsv } from './csv';

describe('cell escaping', () => {
  it('leaves plain text alone', () => {
    expect(serializeCell('plain')).toBe('plain');
  });

  it.each([
    ['a comma', 'a,b', '"a,b"'],
    ['a quote', 'say "hi"', '"say ""hi"""'],
    ['a newline', 'line1\nline2', '"line1\nline2"'],
    ['edge whitespace', '  padded  ', '"  padded  "'],
  ])('quotes text containing %s', (_label, input, expected) => {
    expect(serializeCell(input)).toBe(expected);
  });

  it('distinguishes empty from zero and false', () => {
    expect(serializeCell(null)).toBe('');
    expect(serializeCell(undefined)).toBe('');
    expect(serializeCell(0)).toBe('0');
    expect(serializeCell(false)).toBe('false');
  });

  it('emits nothing for values with no honest representation', () => {
    expect(serializeCell(Number.NaN)).toBe('');
    expect(serializeCell(Number.POSITIVE_INFINITY)).toBe('');
    expect(serializeCell(new Date('not a date'))).toBe('');
  });

  it('writes dates as ISO instants', () => {
    expect(serializeCell(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe('2026-01-02T03:04:05.000Z');
  });
});

describe('spreadsheet formula injection', () => {
  it.each([
    ['=1+1', "'=1+1"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['+x', "'+x"],
    ['-note about the cut', "'-note about the cut"],
  ])('neutralises text starting with a formula character: %s', (input, expected) => {
    expect(serializeCell(input)).toBe(expected);
  });

  it('guards and quotes together when both are needed', () => {
    expect(serializeCell('=cmd|"/c calc"!A0')).toBe('"\'=cmd|""/c calc""!A0"');
  });

  it('does NOT mangle negative numbers', () => {
    // The guard applies to text only; a numeric -5 must stay numeric or every
    // weight delta in the export turns into a string.
    expect(serializeCell(-5)).toBe('-5');
    expect(serializeCell(-5.5)).toBe('-5.5');
  });
});

describe('table serialization', () => {
  it('writes a header and one line per row', () => {
    expect(toCsv([{ a: 1, b: 'x' }, { a: 2, b: 'y' }])).toBe('a,b\n1,x\n2,y\n');
  });

  it('unions columns across ragged rows', () => {
    expect(toCsv([{ a: 1 }, { b: 2 }])).toBe('a,b\n1,\n,2\n');
  });

  it('emits a header for an empty table, so absence is visible', () => {
    expect(toCsv([], ['x', 'y'])).toBe('x,y\n');
  });

  it('honours an explicit column subset', () => {
    expect(toCsv([{ a: 1, b: 2 }], ['b'])).toBe('b\n2\n');
  });
});
