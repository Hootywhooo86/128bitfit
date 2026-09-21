import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
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

const GRID_W = 20;
const GRID_H = 30;

type Block = { m: MuscleGroup | null; x: number; y: number; w: number; h: number };

/** `m: null` is structure — head, hands, feet. Never coloured. */
const FRONT: Block[] = [
  { m: null, x: 8, y: 0, w: 4, h: 3 },
  { m: 'neck', x: 9, y: 3, w: 2, h: 1 },
  { m: 'shoulders', x: 5, y: 4, w: 2, h: 3 },
  { m: 'shoulders', x: 13, y: 4, w: 2, h: 3 },
  { m: 'chest', x: 7, y: 4, w: 6, h: 4 },
  { m: 'biceps', x: 4, y: 7, w: 2, h: 4 },
  { m: 'biceps', x: 14, y: 7, w: 2, h: 4 },
  { m: 'forearms', x: 3, y: 11, w: 2, h: 5 },
  { m: 'forearms', x: 15, y: 11, w: 2, h: 5 },
  { m: null, x: 3, y: 16, w: 2, h: 1 },
  { m: null, x: 15, y: 16, w: 2, h: 1 },
  { m: 'abdominals', x: 8, y: 8, w: 4, h: 6 },
  { m: 'abductors', x: 6, y: 14, w: 1, h: 3 },
  { m: 'abductors', x: 13, y: 14, w: 1, h: 3 },
  { m: 'adductors', x: 9, y: 14, w: 2, h: 4 },
  { m: 'quadriceps', x: 7, y: 14, w: 2, h: 7 },
  { m: 'quadriceps', x: 11, y: 14, w: 2, h: 7 },
  { m: 'calves', x: 7, y: 22, w: 2, h: 6 },
  { m: 'calves', x: 11, y: 22, w: 2, h: 6 },
  { m: null, x: 7, y: 28, w: 2, h: 1 },
  { m: null, x: 11, y: 28, w: 2, h: 1 },
];

const BACK: Block[] = [
  { m: null, x: 8, y: 0, w: 4, h: 3 },
  { m: 'neck', x: 9, y: 3, w: 2, h: 1 },
  { m: 'traps', x: 7, y: 4, w: 6, h: 3 },
  { m: 'shoulders', x: 5, y: 4, w: 2, h: 3 },
  { m: 'shoulders', x: 13, y: 4, w: 2, h: 3 },
  { m: 'lats', x: 6, y: 7, w: 2, h: 5 },
  { m: 'lats', x: 12, y: 7, w: 2, h: 5 },
  { m: 'middle back', x: 8, y: 7, w: 4, h: 4 },
  { m: 'lower back', x: 8, y: 11, w: 4, h: 3 },
  { m: 'triceps', x: 4, y: 7, w: 2, h: 4 },
  { m: 'triceps', x: 14, y: 7, w: 2, h: 4 },
  { m: 'forearms', x: 3, y: 11, w: 2, h: 5 },
  { m: 'forearms', x: 15, y: 11, w: 2, h: 5 },
  { m: null, x: 3, y: 16, w: 2, h: 1 },
  { m: null, x: 15, y: 16, w: 2, h: 1 },
  { m: 'glutes', x: 7, y: 14, w: 6, h: 3 },
  { m: 'hamstrings', x: 7, y: 17, w: 2, h: 5 },
  { m: 'hamstrings', x: 11, y: 17, w: 2, h: 5 },
  { m: 'calves', x: 7, y: 22, w: 2, h: 6 },
  { m: 'calves', x: 11, y: 22, w: 2, h: 6 },
  { m: null, x: 7, y: 28, w: 2, h: 1 },
  { m: null, x: 11, y: 28, w: 2, h: 1 },
];

function colourFor(tally: MuscleTally, m: MuscleGroup | null): string {
  if (m == null) return colors.accentDim;
  return muscleHeat[loadLevel(tally[m])];
}

function Figure({ blocks, tally, width }: { blocks: Block[]; tally: MuscleTally; width: number }) {
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
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.bg,
          }}
        />
      ))}
    </View>
  );
}

export function MuscleMap({
  tally,
  width = 130,
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
          <Figure blocks={FRONT} tally={tally} width={width} />
          <Text style={styles.caption}>Front</Text>
        </View>
        <View style={styles.figureCol}>
          <Figure blocks={BACK} tally={tally} width={width} />
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
