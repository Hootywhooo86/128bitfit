import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFrames, useReduceMotion } from '@/lib/motion';

const PIECES = 18;
const FRAMES = 14;

/**
 * A short shower of square confetti over whatever it sits in, in the accent
 * colour and greys — never the heat colours. Plays once; remount to replay.
 */
export function PixelConfetti({ color, height = 90 }: { color: string; height?: number }) {
  const still = useReduceMotion();
  const frame = useFrames(FRAMES + 1, 70, !still, false);
  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => {
        // Fixed scatter, so every shower looks the same and nothing is random.
        const r = (i * 0.618034) % 1;
        return {
          x: r * 100,
          speed: 0.6 + ((i * 7) % 5) * 0.12,
          drift: ((i % 3) - 1) * 0.9,
          size: i % 4 === 0 ? 5 : 3,
          colour: i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? color : '#8c8c8c',
        };
      }),
    [color]
  );
  if (still || frame >= FRAMES) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => {
        const y = Math.round(frame * p.speed * (height / FRAMES) * 1.4) - 6;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: `${p.x}%`,
              top: y,
              marginLeft: Math.round(frame * p.drift),
              width: p.size,
              height: p.size,
              backgroundColor: p.colour,
            }}
          />
        );
      })}
    </View>
  );
}
