import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { TrainingDayDot } from '@/db/workout-queries';
import { colors, spacing } from '@/lib/theme';

type Props = {
  days: TrainingDayDot[];
};

export function WeekStrip({ days }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Training week</Text>
      <View style={styles.row}>
        {days.map((d) => (
          <View key={d.dayKey} style={styles.day}>
            <Text style={styles.label}>{d.label}</Text>
            <View style={[styles.dot, d.hasWorkout ? styles.dotOn : styles.dotOff]} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  title: { color: colors.text, fontWeight: '700', fontSize: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  day: { alignItems: 'center', gap: 6, flex: 1 },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  dotOn: { backgroundColor: colors.accent },
  dotOff: { backgroundColor: colors.border },
});
