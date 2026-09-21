import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  BACK_RECTS,
  FRONT_RECTS,
  GRID_H,
  GRID_W,
  type Rect,
} from '@/lib/muscle-figure';
import {
  MUSCLE_LABELS,
  loadLevel,
  type MuscleGroup,
  type MuscleTally,
} from '@/lib/muscle-load';
import { colors, muscleHeat, spacing } from '@/lib/theme';

/**
 * Pixel-block muscle map.
 *
 * Blocks rather than anatomical SVG: it matches the app's pixel aesthetic, it
 * needs no artwork, and at this size a realistic figure reads as mush anyway.
 * Colour here is load and nothing else — see lib/theme.ts.
 */

function colourFor(tally: MuscleTally, m: MuscleGroup | null): string {
  if (m == null) return colors.accentDim;
  return muscleHeat[loadLevel(tally[m])];
}

function Figure({ blocks, tally, width }: { blocks: Rect[]; tally: MuscleTally; width: number }) {
  const cell = width / GRID_W;
  return (
    <View style={{ width, height: cell * GRID_H }}>
      {blocks.map((b, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: b.x * cell,
            top: b.y * cell,
            width: b.w * cell,
            height: b.h * cell,
            backgroundColor: colourFor(tally, b.m),
          }}
        />
      ))}
    </View>
  );
}

export function MuscleMap({
  tally,
  width = 128,
  showLegend = true,
}: {
  tally: MuscleTally;
  width?: number;
  showLegend?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.figures}>
        <View style={styles.figureCol}>
          <Figure blocks={FRONT_RECTS} tally={tally} width={width} />
          <Text style={styles.caption}>Front</Text>
        </View>
        <View style={styles.figureCol}>
          <Figure blocks={BACK_RECTS} tally={tally} width={width} />
          <Text style={styles.caption}>Back</Text>
        </View>
      </View>

      {showLegend ? (
        <View style={styles.legend}>
          {(
            [
              ['none', 'Untrained'],
              ['light', '1–3 sets'],
              ['medium', '4–7'],
              ['heavy', '8+'],
            ] as const
          ).map(([level, label]) => (
            <View key={level} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: muscleHeat[level] }]} />
              <Text style={styles.legendText}>{label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export { MUSCLE_LABELS };

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  figures: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg },
  figureCol: { alignItems: 'center', gap: 4 },
  caption: { color: colors.textMuted, fontSize: 11, letterSpacing: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { color: colors.textMuted, fontSize: 11 },
});
