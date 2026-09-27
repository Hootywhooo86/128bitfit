import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as schema from './schema';

/**
 * The library queries against a real SQLite, through the same Drizzle query
 * builder the app uses, with only the driver swapped (expo-sqlite needs a
 * device). The empty-search case is the one that broke: it sorted by a bare
 * `0`, SQLite read that as a column number and refused, and the library
 * showed "0 exercises" with every filter off.
 */
const sqlite = new DatabaseSync(':memory:');

vi.mock('./client', () => ({
  db: drizzle(
    async (query, params, method) => {
      const stmt = sqlite.prepare(query);
      if (method === 'run') {
        stmt.run(...(params as never[]));
        return { rows: [] };
      }
      // The proxy driver wants each row as an array, in column order.
      const rows = stmt.all(...(params as never[])).map((r) => Object.values(r));
      return { rows: method === 'get' ? (rows[0] ?? []) : rows } as { rows: unknown[] };
    },
    { schema }
  ),
}));

const { listExercises, equipmentGroupCounts } = await import('./queries');

const ROWS: [string, string, string | null, string[]][] = [
  ['a', 'Bench Press', 'barbell', ['chest']],
  ['b', 'Smith Machine Squat', 'Smith machine', ['quadriceps']],
  ['c', 'Leg Extension', 'machine', ['quadriceps']],
  ['d', 'Cable Fly', 'Cable machine', ['chest']],
  ['e', 'Landmine Press', 'Landmine', ['shoulders']],
  ['f', 'Hamstring Stretch', null, ['hamstrings']],
  ['g', 'Push Up', 'body only', ['chest']],
];

beforeAll(() => {
  sqlite.exec(`create table exercises (
    id text primary key, name text not null, force text, level text, mechanic text, equipment text,
    primary_muscles text not null default '[]', secondary_muscles text not null default '[]',
    instructions text not null default '[]', category text, images text not null default '[]')`);
  const insert = sqlite.prepare('insert into exercises (id, name, equipment, primary_muscles) values (?, ?, ?, ?)');
  for (const [id, name, equipment, muscles] of ROWS) insert.run(id, name, equipment, JSON.stringify(muscles));
});

const names = (rows: { name: string }[]) => rows.map((r) => r.name);

describe('the exercise library query', () => {
  it('lists everything, by name, with no search and no filter', async () => {
    const rows = await listExercises();
    expect(rows).toHaveLength(ROWS.length);
    expect(names(rows)).toEqual([...names(rows)].sort((x, y) => (x < y ? -1 : 1)));
    expect(await listExercises({ search: '   ' })).toHaveLength(ROWS.length);
  });

  it('puts name matches ahead of muscle matches', async () => {
    const rows = await listExercises({ search: 'chest' });
    expect(names(rows)).toEqual(['Bench Press', 'Cable Fly', 'Push Up']);
    expect(names(await listExercises({ search: 'press' }))[0]).toBe('Bench Press');
  });

  it('filters on the merged group, whatever each source called the equipment', async () => {
    expect(names(await listExercises({ equipmentGroup: 'machine' }))).toEqual([
      'Leg Extension',
      'Smith Machine Squat',
    ]);
    expect(names(await listExercises({ equipmentGroup: 'cable' }))).toEqual(['Cable Fly']);
    expect(names(await listExercises({ equipmentGroup: 'barbell' }))).toEqual(['Bench Press', 'Landmine Press']);
    expect(names(await listExercises({ equipmentGroup: 'other' }))).toEqual(['Hamstring Stretch']);
    expect(await listExercises({ equipmentGroup: 'kettlebell' })).toEqual([]);
  });

  it('combines a group with a muscle and a search', async () => {
    const rows = await listExercises({ equipmentGroup: 'machine', primaryMuscle: 'quadriceps', search: 'leg' });
    expect(names(rows)).toEqual(['Leg Extension']);
  });

  it('counts every exercise into exactly one group', async () => {
    const counts = await equipmentGroupCounts();
    expect(Object.fromEntries(counts)).toEqual({ barbell: 2, machine: 2, cable: 1, other: 1, bodyweight: 1 });
  });
});
