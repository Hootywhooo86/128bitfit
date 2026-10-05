/**
 * Cosmetics for the hero, unlocked by level. All free, all earned by
 * training, never sold — the same promise as the accent colour.
 */
export type CosmeticKind = 'outfit' | 'headband' | 'pet' | 'title';

export type Cosmetic = { id: string; kind: CosmeticKind; name: string; level: number };

export const COSMETICS: readonly Cosmetic[] = [
  { id: 'tee', kind: 'outfit', name: 'Training tee', level: 1 },
  { id: 'tank', kind: 'outfit', name: 'Tank top', level: 4 },
  { id: 'gi', kind: 'outfit', name: 'Gi', level: 12 },
  { id: 'armor', kind: 'outfit', name: 'Plate armour', level: 18 },

  { id: 'none', kind: 'headband', name: 'Bare head', level: 1 },
  { id: 'sweatband', kind: 'headband', name: 'Sweatband', level: 2 },
  { id: 'bandana', kind: 'headband', name: 'Bandana', level: 8 },
  { id: 'crown', kind: 'headband', name: 'Crown', level: 25 },

  { id: 'none', kind: 'pet', name: 'No pet', level: 1 },
  { id: 'slime', kind: 'pet', name: 'Slime', level: 6 },
  { id: 'cat', kind: 'pet', name: 'Gym cat', level: 14 },
  { id: 'dragon', kind: 'pet', name: 'Dragon', level: 22 },

  { id: 'novice', kind: 'title', name: 'NOVICE', level: 1 },
  { id: 'squire', kind: 'title', name: 'SQUIRE', level: 3 },
  { id: 'iron-knight', kind: 'title', name: 'IRON KNIGHT', level: 5 },
  { id: 'barbell-baron', kind: 'title', name: 'BARBELL BARON', level: 10 },
  { id: 'plate-paladin', kind: 'title', name: 'PLATE PALADIN', level: 15 },
  { id: 'gym-wizard', kind: 'title', name: 'GYM WIZARD', level: 20 },
  { id: 'legend', kind: 'title', name: 'LEGEND', level: 30 },
  { id: 'final-boss', kind: 'title', name: 'FINAL BOSS', level: 50 },
];

export type Look = Record<CosmeticKind, string>;

export const DEFAULT_LOOK: Look = { outfit: 'tee', headband: 'none', pet: 'none', title: 'novice' };

export function cosmetic(kind: CosmeticKind, id: string): Cosmetic | undefined {
  return COSMETICS.find((c) => c.kind === kind && c.id === id);
}

/** Unlocked at `level`. */
export function unlockedAt(level: number): Cosmetic[] {
  return COSMETICS.filter((c) => c.level <= level);
}

/** Newly unlocked by going from `from` to `to`. */
export function unlockedBetween(from: number, to: number): Cosmetic[] {
  return COSMETICS.filter((c) => c.level > from && c.level <= to);
}

/**
 * A stored look, made safe: anything unknown or not yet unlocked falls back
 * to the default for that slot rather than showing gear the level has not
 * earned (a restored backup from a higher level, say).
 */
export function resolveLook(raw: unknown, level: number): Look {
  const look = { ...DEFAULT_LOOK };
  if (!raw || typeof raw !== 'object') return look;
  for (const kind of Object.keys(DEFAULT_LOOK) as CosmeticKind[]) {
    const id = (raw as Record<string, unknown>)[kind];
    const c = typeof id === 'string' ? cosmetic(kind, id) : undefined;
    if (c && c.level <= level) look[kind] = c.id;
  }
  return look;
}
