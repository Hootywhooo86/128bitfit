import { describe, expect, it } from 'vitest';
import { parseCsv, parseImport, parseSetCsv, parseSetJson, toIsoDay } from './parse';

const HEVY = `title,start_time,end_time,exercise_title,set_index,weight_kg,reps,rpe,notes
"Push Day A","12 Sep 2025, 18:04","12 Sep 2025, 19:10","Bench Press (Barbell)",1,60,8,7,""
"Push Day A","12 Sep 2025, 18:04","12 Sep 2025, 19:10","Bench Press (Barbell)",2,62.5,6,8,"felt heavy"
"Push Day A","12 Sep 2025, 18:04","12 Sep 2025, 19:10","Lateral Raise (Dumbbell)",1,10,15,,""`;

describe('CSV reading', () => {
  it('handles quotes, commas inside fields and doubled quotes', () => {
    const rows = parseCsv('a,b\n"x, y","he said ""hi"""\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
    ]);
  });

  it('handles a newline inside a quoted field', () => {
    expect(parseCsv('a\n"one\ntwo"\n')).toEqual([['a'], ['one\ntwo']]);
  });

  it('strips the BOM Excel writes', () => {
    expect(parseCsv('﻿a,b\n1,2')[0]).toEqual(['a', 'b']);
  });

  it('drops blank lines rather than emitting empty rows', () => {
    expect(parseCsv('a,b\n\n1,2\n\n')).toHaveLength(2);
  });
});

describe('dates', () => {
  it('reads ISO, with or without a time', () => {
    expect(toIsoDay('2025-09-12')).toBe('2025-09-12');
    expect(toIsoDay('2025-09-12T18:04:00Z')).toBe('2025-09-12');
  });

  it("reads Hevy's format", () => {
    expect(toIsoDay('12 Sep 2025, 18:04')).toBe('2025-09-12');
    expect(toIsoDay('3 March 2025')).toBe('2025-03-03');
  });

  it('resolves a slashed date when one field cannot be a month', () => {
    expect(toIsoDay('13/09/2025')).toBe('2025-09-13');
    expect(toIsoDay('09/13/2025')).toBe('2025-09-13');
  });

  it('leaves an unreadable date unread rather than guessing', () => {
    expect(toIsoDay('last Tuesday')).toBeNull();
    expect(toIsoDay('')).toBeNull();
    expect(toIsoDay(undefined)).toBeNull();
  });
});

describe('a Hevy export', () => {
  const r = parseSetCsv(HEVY);

  it('is recognised as Hevy', () => {
    if ('error' in r) throw new Error(r.error);
    expect(r.format).toBe('hevy-csv');
    expect(r.sets).toHaveLength(3);
  });

  it('reads the set through', () => {
    if ('error' in r) throw new Error(r.error);
    expect(r.sets[1]).toEqual({
      date: '2025-09-12',
      startedAt: '12 Sep 2025, 18:04',
      workoutName: 'Push Day A',
      exerciseName: 'Bench Press (Barbell)',
      setIndex: 2,
      weight: 62.5,
      weightUnit: 'kg',
      reps: 6,
      rpe: 8,
      notes: 'felt heavy',
    });
  });

  it('takes the unit from the column name instead of assuming one', () => {
    if ('error' in r) throw new Error(r.error);
    expect(r.sets.every((s) => s.weightUnit === 'kg')).toBe(true);
    const lb = parseSetCsv('exercise_title,start_time,weight_lbs,reps\nSquat,2025-01-02,225,5');
    if ('error' in lb) throw new Error(lb.error);
    expect(lb.sets[0].weightUnit).toBe('lb');
  });

  it('leaves an absent RPE null rather than 0', () => {
    if ('error' in r) throw new Error(r.error);
    expect(r.sets[2].rpe).toBeNull();
    expect(r.sets[0].rpe).toBe(7);
  });
});

describe('rows that cannot be read are reported, not dropped', () => {
  it('reports an unreadable date with its row number', () => {
    const r = parseSetCsv(
      'exercise_title,start_time,weight_kg,reps\nSquat,2025-01-02,100,5\nSquat,someday,100,5'
    );
    if ('error' in r) throw new Error(r.error);
    expect(r.sets).toHaveLength(1);
    expect(r.skipped).toEqual([{ row: 3, reason: 'unreadable date "someday"' }]);
  });

  it('reports a row with neither weight nor reps', () => {
    const r = parseSetCsv('exercise_title,start_time,weight_kg,reps\nSquat,2025-01-02,,');
    expect('error' in r).toBe(true);
  });

  it('refuses a file with no exercise or date column', () => {
    const r = parseSetCsv('foo,bar\n1,2');
    expect('error' in r && r.error).toMatch(/exercise or date/);
  });

  it('refuses a header with no rows under it', () => {
    expect('error' in parseSetCsv('exercise_title,start_time')).toBe(true);
  });
});

describe('JSON import', () => {
  it('reads a bare array of sets', () => {
    const r = parseSetJson(
      JSON.stringify([{ exerciseName: 'Deadlift', date: '2025-02-01', weight: 140, reps: 3 }])
    );
    if ('error' in r) throw new Error(r.error);
    expect(r.sets[0].exerciseName).toBe('Deadlift');
    expect(r.sets[0].weight).toBe(140);
  });

  it("reads this app's own export shape", () => {
    const r = parseSetJson(
      JSON.stringify({ tables: { sets: [{ exercise: 'Row', loggedAt: '2025-02-01T10:00:00Z', reps: 10 }] } })
    );
    if ('error' in r) throw new Error(r.error);
    expect(r.sets).toHaveLength(1);
    expect(r.sets[0].date).toBe('2025-02-01');
  });

  it('says so plainly when the JSON is invalid or has no sets', () => {
    expect('error' in parseSetJson('{oops')).toBe(true);
    expect('error' in parseSetJson(JSON.stringify({ hello: 'world' }))).toBe(true);
  });

  it('leaves an unsupplied weight null, not 0', () => {
    const r = parseSetJson(JSON.stringify([{ name: 'Plank', date: '2025-02-01', reps: 1 }]));
    if ('error' in r) throw new Error(r.error);
    expect(r.sets[0].weight).toBeNull();
    expect(r.sets[0].weightUnit).toBeNull();
  });
});

describe('picking a parser', () => {
  it('goes by extension', () => {
    const r = parseImport('workouts.csv', HEVY);
    if ('error' in r) throw new Error(r.error);
    expect(r.format).toBe('hevy-csv');
  });

  it('sniffs the content when the name gives nothing away', () => {
    const r = parseImport('export', JSON.stringify([{ name: 'Row', date: '2025-01-01', reps: 8 }]));
    if ('error' in r) throw new Error(r.error);
    expect(r.format).toBe('json');
  });
});
