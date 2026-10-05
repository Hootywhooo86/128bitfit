import type { Look } from './cosmetics';
import type { TrophyId } from './trophies';

/**
 * Hand-authored pixel sprites. One character per pixel, '.' is empty.
 *
 * Colours are tokens, not values, so the screen decides what they are: the
 * game uses greys and the accent colour only — never the muscle-load heat
 * colours, which mean data.
 */
export type Tone = 'outline' | 'hair' | 'skin' | 'light' | 'mid' | 'dark' | 'white' | 'accent' | 'accentDim';

/** 16 wide, 24 tall. 'o' is the top, 'p' the shorts; outfits decide their tone. */
const HERO_BASE = [
  '......hhhh......',
  '.....hhhhhh.....',
  '....hhhhhhhh....',
  '....hssssssh....',
  '....ssksskss....',
  '....ssssssss....',
  '....ssskksss....',
  '.....ssssss.....',
  '......ssss......',
  '...oooooooooo...',
  '..oooooooooooo..',
  '..oooooooooooo..',
  '.s.oooooooooo.s.',
  '.s.oooooooooo.s.',
  '.s.oooooooooo.s.',
  '.s.oooooooooo.s.',
  '...pppppppppp...',
  '...pppppppppp...',
  '...pppp..pppp...',
  '...ssss..ssss...',
  '...ssss..ssss...',
  '...ssss..ssss...',
  '...kkkk..kkkk...',
  '..kkkkk..kkkkk..',
];

export const HERO_WIDTH = 16;
export const HERO_HEIGHT = 24;

type Paint = (x: number, y: number) => Tone;

const OUTFITS: Record<string, { top: Paint; bottom: Paint }> = {
  tee: { top: () => 'light', bottom: () => 'dark' },
  tank: {
    // Bare shoulders: the outer columns of the top are skin.
    top: (x, y) => (y <= 11 && (x <= 3 || x >= 12) ? 'skin' : 'light'),
    bottom: () => 'dark',
  },
  gi: {
    // A white gi with a dark lapel and a belt in the accent colour.
    top: (x, y) => (y <= 13 && (x === 7 || x === 8) && y >= 9 ? 'mid' : 'white'),
    bottom: (_x, y) => (y === 16 ? 'accent' : 'white'),
  },
  armor: {
    top: (x, y) => (y <= 10 && (x <= 4 || x >= 11) ? 'accent' : (x + y) % 2 ? 'mid' : 'light'),
    bottom: () => 'mid',
  },
};

const TONE_OF: Record<string, Tone> = { h: 'hair', s: 'skin', k: 'outline' };

/** The hero in a given look, as rows of tones (null = empty). */
export function heroPixels(look: Look): (Tone | null)[][] {
  const outfit = OUTFITS[look.outfit] ?? OUTFITS.tee;
  const grid = HERO_BASE.map((row, y) =>
    [...row].map((c, x): Tone | null => {
      if (c === '.') return null;
      if (c === 'o') return outfit.top(x, y);
      if (c === 'p') return outfit.bottom(x, y);
      return TONE_OF[c] ?? null;
    })
  );
  const set = (x: number, y: number, t: Tone) => {
    if (grid[y] && x >= 0 && x < HERO_WIDTH) grid[y][x] = t;
  };
  if (look.headband === 'sweatband') for (let x = 4; x <= 11; x++) set(x, 2, 'accent');
  if (look.headband === 'bandana') {
    for (let x = 4; x <= 11; x++) set(x, 2, 'accent');
    set(12, 3, 'accent');
    set(13, 4, 'accent');
  }
  if (look.headband === 'crown') {
    for (const x of [4, 6, 9, 11]) set(x, 0, 'accent');
    for (let x = 4; x <= 11; x++) set(x, 1, 'accent');
  }
  return grid;
}

/** Pets: 8 by 8, drawn at the hero's feet. 'a' accent, 'l' light, 'k' outline. */
export const PETS: Record<string, string[]> = {
  slime: [
    '........',
    '...kk...',
    '..kaak..',
    '.kaaaak.',
    'kakaakak',
    'kaaaaaak',
    'kaaaaaak',
    '.kkkkkk.',
  ],
  cat: [
    'l..l....',
    'llll....',
    'lklk...l',
    'llll...l',
    '.lllll.l',
    '.llllll.',
    '.llllll.',
    '.l..l...',
  ],
  dragon: [
    '.....kk.',
    '....kaak',
    '....kaka',
    'k..kaaak',
    'kakaaak.',
    '.kaaaak.',
    '..kaak..',
    '..k..k..',
  ],
};

const PET_TONE: Record<string, Tone> = { a: 'accent', l: 'light', k: 'outline' };

export function petPixels(id: string): (Tone | null)[][] | null {
  const rows = PETS[id];
  if (!rows) return null;
  return rows.map((row) => [...row].map((c) => (c === '.' ? null : (PET_TONE[c] ?? null))));
}

/**
 * Trophy icons, 16 by 16. '#' body, '+' shade, '*' shine. Earned ones are
 * drawn in the accent colour, locked ones in grey.
 */
export const TROPHY_SPRITES: Record<TrophyId, string[]> = {
  'first-blood': [
    '..............##',
    '.............#*#',
    '............#*#.',
    '...........#*#..',
    '..........#*#...',
    '.........#*#....',
    '........#*#.....',
    '.......#*#......',
    '..#...#*#.......',
    '..##.#*#........',
    '...###+.........',
    '....#+#.........',
    '...#+###........',
    '..#+#..##.......',
    '.#+#............',
    '.##.............',
  ],
  'iron-plate': [
    '................',
    '.....######.....',
    '...##++++++##...',
    '..#++######++#..',
    '..#+##....##+#..',
    '.#+##......##+#.',
    '.#+#...##...#+#.',
    '.#+#..#..#..#+#.',
    '.#+#..#..#..#+#.',
    '.#+#...##...#+#.',
    '.#+##......##+#.',
    '..#+##....##+#..',
    '..#++######++#..',
    '...##++++++##...',
    '.....######.....',
    '................',
  ],
  'ton-up': [
    '................',
    '................',
    '................',
    '..##........##..',
    '.###........###.',
    '.###+......+###.',
    '####+......+####',
    '####++++++++####',
    '####++++++++####',
    '####+......+####',
    '.###+......+###.',
    '.###........###.',
    '..##........##..',
    '................',
    '................',
    '................',
  ],
  'dungeon-crawler': [
    '................',
    '......####......',
    '....##++++##....',
    '...#++++++++#...',
    '..#++#++++#++#..',
    '..#++#++++#++#..',
    '..#++#++++#++#..',
    '..#++++++++++#..',
    '..#++#++++#++#..',
    '..#++#+++*#++#..',
    '..#++#++++#++#..',
    '..#++#++++#++#..',
    '..#++++++++++#..',
    '..############..',
    '.##############.',
    '................',
  ],
  'boss-rush': [
    '................',
    '.....######.....',
    '...##++++++##...',
    '..#++++++++++#..',
    '..#++++++++++#..',
    '.#++..++++..++#.',
    '.#+....++....+#.',
    '.#+....++....+#.',
    '.#++..+..+..++#.',
    '..#+++....+++#..',
    '...#++++++++#...',
    '....#+#++#+#....',
    '....#+#++#+#....',
    '.....######.....',
    '................',
    '................',
  ],
  'world-map': [
    '................',
    '.....######.....',
    '...##+##++++##..',
    '..#+####+++++#..',
    '.#++###+++##++#.',
    '.#+++#++++###+#.',
    '#+++++++++####+#',
    '#++##+++++###++#',
    '#+####+++++#+++#',
    '#++####+++++++##',
    '.#++###++++++#+.',
    '.#+++#+++++##+#.',
    '..#++++++####+..',
    '...##++++++##...',
    '.....######.....',
    '................',
  ],
  marathon: [
    '................',
    '.##############.',
    '.#+#********#+#.',
    '.#+#********#+#.',
    '.#+#****##**#+#.',
    '.#+#****##**#+#.',
    '.#+##########+#.',
    '.#++++++++++++#.',
    '.#+##########+#.',
    '.#+#........#+#.',
    '.#+#.######.#+#.',
    '.#+#........#+#.',
    '.#+#.####...#+#.',
    '.#+#........#+#.',
    '.##############.',
    '................',
  ],
  'potion-master': [
    '................',
    '......####......',
    '......#++#......',
    '.......##.......',
    '......#..#......',
    '......#..#......',
    '.....#....#.....',
    '....#......#....',
    '...#++++++++#...',
    '..#+*++++++++#..',
    '..#+*++++++++#..',
    '..#++++++++++#..',
    '..#++++++++++#..',
    '...#++++++++#...',
    '....########....',
    '................',
  ],
  'new-game-plus': [
    '................',
    '...###....###...',
    '..#+++#..#+++#..',
    '.#+++++##+++++#.',
    '.#++++++++++++#.',
    '.#+++++**+++++#.',
    '.#+++++**+++++#.',
    '.#+++******+++#.',
    '..#++******++#..',
    '...#+++**+++#...',
    '....#++**++#....',
    '.....#++++#.....',
    '......#++#......',
    '.......##.......',
    '................',
    '................',
  ],
};

export function trophyPixels(id: TrophyId, earned: boolean): (Tone | null)[][] {
  const map: Record<string, Tone> = earned
    ? { '#': 'accent', '+': 'accentDim', '*': 'white' }
    : { '#': 'dark', '+': 'outline', '*': 'mid' };
  return TROPHY_SPRITES[id].map((row) => [...row].map((c) => (c === '.' ? null : (map[c] ?? null))));
}
