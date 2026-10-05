import React from 'react';
import { View } from 'react-native';
import { useAccent } from '@/lib/accent';
import { toneColor, toneOpacity } from '@/lib/game/palette';
import type { Tone } from '@/lib/game/sprites';

/**
 * Draws a pixel grid as plain squares, one View per horizontal run of the same
 * tone — a 16×24 sprite is about a hundred Views rather than four hundred.
 *
 * Squares, not SVG: react-native-svg anti-aliases rect edges and leaves
 * hairline seams between pixels. Whole points per pixel keep edges sharp.
 */
export function PixelSprite({
  pixels,
  px,
  label,
}: {
  pixels: (Tone | null)[][];
  /** Points per pixel. Whole numbers only. */
  px: number;
  label?: string;
}) {
  const accent = useAccent();
  const width = Math.max(0, ...pixels.map((r) => r.length));
  const runs: { x: number; y: number; w: number; tone: Tone }[] = [];
  pixels.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const tone = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === tone) end++;
      if (tone) runs.push({ x, y, w: end - x, tone });
      x = end;
    }
  });
  return (
    <View
      style={{ width: width * px, height: pixels.length * px }}
      accessibilityLabel={label}
      accessible={label != null}
    >
      {runs.map((r) => (
        <View
          key={`${r.x}-${r.y}`}
          style={{
            position: 'absolute',
            left: r.x * px,
            top: r.y * px,
            width: r.w * px,
            height: px,
            backgroundColor: toneColor(r.tone, accent),
            opacity: toneOpacity(r.tone),
          }}
        />
      ))}
    </View>
  );
}
