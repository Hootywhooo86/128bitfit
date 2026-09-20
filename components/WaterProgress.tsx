import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@/lib/theme';

type Props = {
  ml: number;
  targetMl: number;
};

export function WaterProgress({ ml, targetMl }: Props) {
  const pct = targetMl > 0 ? Math.min(1, Math.max(0, ml / targetMl)) : 0;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.title}>Water</Text>
        <Text style={styles.value}>
          {ml} / {targetMl} ml
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>
      <Text style={styles.hint}>{Math.round(pct * 100)}% of daily target</Text>
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontWeight: '700', fontSize: 15 },
  value: { color: colors.accent, fontWeight: '800' },
  track: {
    height: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: '#4db8ff', borderRadius: 4 },
  hint: { color: colors.textMuted, fontSize: 12 },
});
