import React from 'react';
import { View } from 'react-native';
import { SPARK_DIRECTIONS } from '@/lib/fx-sprites';
import { useFrames, useReduceMotion } from '@/lib/motion';

/** Distance from the centre and spark size, per frame. */
const STEPS: [number, number][] = [
  [6, 4],
  [11, 4],
  [15, 3],
  [18, 2],
];

/**
 * Sparks thrown out from the centre of whatever it sits in, once, over about
 * a quarter of a second. Remount it (change its key) to play it again.
 * Nothing at all with Reduce motion on.
 */
export function PixelBurst({ color }: { color: string }) {
  const still = useReduceMotion();
  const frame = useFrames(STEPS.length + 1, 60, !still, false);
  if (still || frame >= STEPS.length) return null;
  const [d, sz] = STEPS[frame];
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 }}>
      {SPARK_DIRECTIONS.map(([dx, dy], i) => {
        // Diagonals travel a little less, so the burst stays round.
        const k = dx && dy ? 0.75 : 1;
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: Math.round(dx * d * k - sz / 2),
              top: Math.round(dy * d * k - sz / 2),
              width: sz,
              height: sz,
              backgroundColor: i % 2 ? '#ffffff' : color,
            }}
          />
        );
      })}
    </View>
  );
}
