import React, { useMemo, useState } from 'react';
import { PixelRatio, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { FULL_SETS, IMAGE_H, IMAGE_W, muscleAt, paint, toPaths } from '@/lib/muscle-figure/figure';
import type { View as Side } from '@/lib/muscle-figure/shapes';
import { MUSCLE_GROUPS, MUSCLE_LABELS, type MuscleGroup, type MuscleTally } from '@/lib/muscle-load';
import { colors, fonts, muscleHeat, spacing, themedStyles } from '@/lib/theme';

/**
 * The muscle map: a lit pixel figure, front and back, whose muscles fill from
 * the bottom up as sets are logged — full at ten sets — in the heat colour
 * for the count. Grey is untrained. Tap a muscle to see its name and sets.
 *
 * Drawn with SVG, one path per colour, at a whole number of physical pixels
 * per figure pixel so every edge lands on the screen's own pixel grid and
 * stays sharp.
 */
export function PixelMuscleMap({
  tally,
  width = 150,
  compact = false,
  empty,
}: {
  tally: MuscleTally;
  /** Roughly how wide each figure should be, in points. */
  width?: number;
  /** Leaves out the footnote once something is trained. */
  compact?: boolean;
  /** Said under the map when nothing has been trained. */
  empty?: string;
}) {
  const [picked, setPicked] = useState<MuscleGroup | null>(null);
  const ratio = PixelRatio.get();
  const cell = Math.max(1, Math.floor((width * ratio) / IMAGE_W)) / ratio;
  const key = MUSCLE_GROUPS.map((m) => tally[m]).join(',');
  const worked = MUSCLE_GROUPS.filter((m) => tally[m] > 0);

  const onTap = (side: Side) => (e: GestureResponderEvent) => {
    const m = muscleAt(side, e.nativeEvent.locationX / cell, e.nativeEvent.locationY / cell);
    setPicked((prev) => (m && prev !== m ? m : null));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.screen}>
        {(['front', 'back'] as const).map((side) => (
          <View key={side} style={styles.col}>
            <Figure side={side} tally={tally} tallyKey={key} cell={cell} onPress={onTap(side)} />
            <Text style={styles.caption}>{side.toUpperCase()}</Text>
          </View>
        ))}
      </View>

      {picked ? (
        <Text style={styles.picked}>
          {MUSCLE_LABELS[picked]} · {formatSets(tally[picked])}
        </Text>
      ) : null}

      <View style={styles.legend}>
        <Key colour={muscleHeat.light} label="1–3" />
        <Key colour={muscleHeat.medium} label="4–7" />
        <Key colour={muscleHeat.heavy} label="8+ SETS" />
      </View>

      {worked.length === 0 ? (
        <Text style={styles.note}>{empty ?? 'Nothing trained yet. Log a set and the muscles it works fill in.'}</Text>
      ) : compact ? null : (
        <Text style={styles.note}>
          A muscle fills from the bottom up and is full at {FULL_SETS} sets. Tap one to see its count.
        </Text>
      )}
    </View>
  );
}

function formatSets(n: number): string {
  if (n <= 0) return 'not trained';
  return `${Number.isInteger(n) ? n : n.toFixed(1)} ${n === 1 ? 'set' : 'sets'}`;
}

/** Repaints only when the counts change, not on every parent render. */
const Figure = React.memo(
  function Figure({
    side,
    tally,
    cell,
    onPress,
  }: {
    side: Side;
    tally: MuscleTally;
    tallyKey: string;
    cell: number;
    onPress: (e: GestureResponderEvent) => void;
  }) {
    const paths = useMemo(() => toPaths(paint(side, tally)), [side, tally]);
    return (
      <Pressable onPress={onPress} accessibilityRole="image" accessibilityLabel={`Muscle map, ${side}`}>
        <Svg width={IMAGE_W * cell} height={IMAGE_H * cell} viewBox={`0 0 ${IMAGE_W} ${IMAGE_H}`}>
          {paths.map((p) => (
            <Path key={p.colour} d={p.d} fill={p.colour} />
          ))}
        </Svg>
      </Pressable>
    );
  },
  (a, b) => a.side === b.side && a.tallyKey === b.tallyKey && a.cell === b.cell
);

function Key({ colour, label }: { colour: string; label: string }) {
  return (
    <View style={styles.key}>
      <View style={[styles.swatch, { backgroundColor: colour }]} />
      <Text style={styles.keyText}>{label}</Text>
    </View>
  );
}

const styles = themedStyles(() =>
  StyleSheet.create({
    wrap: { gap: spacing.sm },
    screen: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.md,
      backgroundColor: colors.surfaceAlt,
      borderRadius: 8,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    col: { alignItems: 'center', gap: 6 },
    caption: { fontFamily: fonts.pixel, fontSize: 7, color: colors.textDim, letterSpacing: 1.5 },
    picked: { fontFamily: fonts.pixel, fontSize: 10, color: colors.text, textAlign: 'center', letterSpacing: 1 },
    legend: { flexDirection: 'row', justifyContent: 'center', gap: spacing.lg },
    key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    swatch: { width: 9, height: 9 },
    keyText: { fontFamily: fonts.pixel, fontSize: 7, color: colors.textDim, letterSpacing: 1 },
    note: { color: colors.textDim, fontSize: 12.5, textAlign: 'center', lineHeight: 19, fontFamily: fonts.body },
  })
);
