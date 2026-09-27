import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EQUIPMENT } from '@/scripts/repdb-map.mjs';
import { EQUIPMENT_GROUPS, equipmentGroup } from './equipment-groups';

const bundled = JSON.parse(fs.readFileSync('assets/data/exercises.json', 'utf8')) as { equipment: string | null }[];

describe('equipment groups', () => {
  it('files every bundled equipment value where a lifter would look for it', () => {
    const got = Object.fromEntries([...new Set(bundled.map((e) => e.equipment))].map((v) => [String(v), equipmentGroup(v)]));
    expect(got).toEqual({
      barbell: 'barbell',
      'e-z curl bar': 'barbell',
      dumbbell: 'dumbbell',
      kettlebells: 'kettlebell',
      cable: 'cable',
      machine: 'machine',
      'body only': 'bodyweight',
      bands: 'bands',
      'medicine ball': 'ball',
      'exercise ball': 'ball',
      'foam roll': 'other',
      other: 'other',
      null: 'other',
    });
  });

  it('merges the spellings an openGym import or a typed machine brings', () => {
    expect(equipmentGroup('Machine')).toBe('machine');
    expect(equipmentGroup('Smith machine')).toBe('machine');
    expect(equipmentGroup('Leg press')).toBe('machine');
    expect(equipmentGroup('Cable machine')).toBe('cable');
    expect(equipmentGroup('Landmine')).toBe('barbell');
    expect(equipmentGroup('EZ bar')).toBe('barbell');
    expect(equipmentGroup('Pull-up bar')).toBe('bodyweight');
    expect(equipmentGroup('Resistance band')).toBe('bands');
    expect(equipmentGroup('  ')).toBe('other');
    expect(equipmentGroup('hover board')).toBe('other');
  });

  it('keeps every RepDB value in the group its mapping implies', () => {
    for (const mapped of new Set(Object.values(EQUIPMENT))) {
      expect(EQUIPMENT_GROUPS.some((g) => g.id === equipmentGroup(mapped)), mapped).toBe(true);
    }
    expect(equipmentGroup(EQUIPMENT.pull_up_bar)).toBe('bodyweight');
    expect(equipmentGroup(EQUIPMENT.smith_machine)).toBe('machine');
  });
});
