import React from 'react';
import { View, type ViewStyle } from 'react-native';
import type { Rows } from '@/lib/fx-sprites';

/**
 * Draws character rows as squares, one View per horizontal run of a colour.
 * `palette` maps each character to a colour; '.' and unmapped characters are
 * empty. Whole points per pixel keep the edges sharp.
 */
export function PixelGrid({
  rows,
  palette,
  px,
  style,
}: {
  rows: Rows;
  palette: Record<string, string>;
  px: number;
  style?: ViewStyle;
}) {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const runs: { x: number; y: number; w: number; c: string }[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      const c = palette[ch];
      if (c) runs.push({ x, y, w: end - x, c });
      x = end;
    }
  });
  return (
    <View style={[{ width: width * px, height: rows.length * px }, style]} pointerEvents="none">
      {runs.map((r) => (
        <View
          key={`${r.x}-${r.y}`}
          style={{ position: 'absolute', left: r.x * px, top: r.y * px, width: r.w * px, height: px, backgroundColor: r.c }}
        />
      ))}
    </View>
  );
}
