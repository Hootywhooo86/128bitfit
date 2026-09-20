import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@/lib/theme';
import { formatKcal } from '@/lib/nutrition';

type Props = {
  consumed: number;
  target: number;
};

/** Simple calorie progress bar (ring deferred — bar is clear and cheap). */
export function CalorieProgress({ consumed, target }: Props) {
  const pct = target > 0 ? Math.min(1, Math.max(0, consumed / target)) : 0;
  const remaining = Math.round(target - consumed);
  const over = remaining < 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View>
          <Text style={styles.consumed}>{formatKcal(consumed)}</Text>
          <Text style={styles.label}>kcal eaten</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.remaining, over && styles.over]}>
            {over ? `${Math.abs(remaining)} over` : `${remaining} left`}
          </Text>
          <Text style={styles.label}>of {formatKcal(target)} goal</Text>
        </View>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${Math.round(pct * 100)}%` },
            over && styles.fillOver,
          ]}
        />
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  consumed: { color: colors.accent, fontSize: 32, fontWeight: '900' },
  remaining: { color: colors.text, fontSize: 16, fontWeight: '700' },
  over: { color: colors.danger },
  label: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  track: {
    height: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 5,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 5,
  },
  fillOver: { backgroundColor: colors.danger },
});
