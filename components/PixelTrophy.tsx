import React from 'react';
import { View } from 'react-native';
import { useAccent } from '@/lib/accent';

/**
 * The personal-record trophy: a hand-authored 16×16 sprite, like the rest of
 * the app's pixel art, drawn in the accent colour so it follows the theme.
 *
 * '#' body, '+' shade (the body at lower opacity), '*' shine (white over the
 * body), '.' empty.
 *
 * Plain squares rather than SVG: react-native-svg anti-aliases rect edges,
 * which leaves hairline seams between pixels. A whole number of points per
 * pixel keeps every edge sharp.
 */
const SPRITE = [
  '................',
  '..############..',
  '.##+#########+##',
  '#.#*########+#.#',
  '#.#*########+#.#',
  '#.#*########+#.#',
  '.##*########+##.',
  '...#+#######+#..',
  '....#+######....',
  '.....#+####.....',
  '......#++#......',
  '.......##.......',
  '......####......',
  '....########....',
  '....#++++++#....',
  '....########....',
];

type Pixel = { x: number; y: number; kind: '#' | '+' | '*' };
const PIXELS: Pixel[] = SPRITE.flatMap((row, y) =>
  [...row].flatMap((c, x) => (c === '.' ? [] : [{ x, y, kind: c as Pixel['kind'] }]))
);

/** `size` is rounded down to a multiple of 16 so each pixel is whole. */
export function PixelTrophy({ size = 32 }: { size?: number }) {
  const accent = useAccent();
  const px = Math.max(1, Math.floor(size / 16));
  return (
    <View style={{ width: px * 16, height: px * 16 }} accessibilityLabel="Personal record">
      {PIXELS.map((p) => (
        <View
          key={`${p.x}-${p.y}`}
          style={{
            position: 'absolute',
            left: p.x * px,
            top: p.y * px,
            width: px,
            height: px,
            backgroundColor: accent,
            opacity: p.kind === '+' ? 0.55 : 1,
          }}
        >
          {p.kind === '*' ? (
            <View style={{ flex: 1, backgroundColor: '#ffffff', opacity: 0.6 }} />
          ) : null}
        </View>
      ))}
    </View>
  );
}
