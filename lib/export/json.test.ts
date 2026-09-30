import { describe, expect, it } from 'vitest';
import { EXCLUDED, buildEnvelope } from './json';
import type { ExportTable } from './collect';

const exportedAt = new Date(Date.UTC(2026, 8, 21, 3, 4, 5));

function table(partial: Partial<ExportTable>): ExportTable {
  return { name: 't', columns: [], rows: [], ...partial };
}

describe('row projection', () => {
  it('drops scratch and undeclared keys', () => {
    // collect.ts sets catalog_name: undefined while resolving food_name.
    const env = buildEnvelope(
      [
        table({
          name: 'food_logs',
          columns: ['id', 'food_name', 'calories'],
          rows: [
            { id: 'f1', food_name: 'Oats', calories: 320, catalog_name: undefined, other: 'x' },
          ],
        }),
      ],
      exportedAt
    );
    expect(Object.keys(env.tables.food_logs[0])).toEqual(['id', 'food_name', 'calories']);
  });

  it('keeps a declared column that is absent from the row, as null', () => {
    const env = buildEnvelope([table({ columns: ['a', 'b'], rows: [{ a: 1 }] })], exportedAt);
    expect(env.tables.t[0]).toEqual({ a: 1, b: null });
  });

  it('preserves zero and false rather than nulling them', () => {
    const env = buildEnvelope(
      [table({ columns: ['reps', 'completed'], rows: [{ reps: 0, completed: false }] })],
      exportedAt
    );
    expect(env.tables.t[0].reps).toBe(0);
    expect(env.tables.t[0].completed).toBe(false);
  });

  it('writes dates as ISO and invalid dates as null', () => {
    const env = buildEnvelope(
      [
        table({
          columns: ['good', 'bad'],
          rows: [{ good: new Date(Date.UTC(2026, 0, 2)), bad: new Date('nope') }],
        }),
      ],
      exportedAt
    );
    expect(env.tables.t[0].good).toBe('2026-01-02T00:00:00.000Z');
    expect(env.tables.t[0].bad).toBeNull();
  });

  it('includes an empty table as an empty array', () => {
    const env = buildEnvelope([table({ name: 'water_logs', columns: ['id'] })], exportedAt);
    expect(env.tables.water_logs).toEqual([]);
  });
});

describe('envelope metadata', () => {
  it('identifies the format and version', () => {
    const env = buildEnvelope([], exportedAt);
    expect(env.format).toBe('128bitfit-export');
    expect(env.formatVersion).toBe(2);
    expect(env.exportedAt).toBe('2026-09-21T03:04:05.000Z');
  });

  it('states what was left out, so omissions are not silent', () => {
    const env = buildEnvelope([], exportedAt);
    expect(Object.keys(env.excluded).sort()).toEqual([
      'exercises',
      'foods',
      'meta',
      'off_food_cache',
    ]);
    expect(env.excluded).toEqual(EXCLUDED);
  });
});
