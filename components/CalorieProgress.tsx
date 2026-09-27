import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, themedStyles } from '@/lib/theme';
import { calorieRingState } from '@/lib/calorie-ring';
import { formatKcal } from '@/lib/nutrition';

type Props = {
  /**
   * Calories eaten today, or null when nothing has been logged yet.
   *
   * Null is not zero. "Logged nothing" and "ate nothing" are different claims,
   * and only one of them is ever true — see the empty-state table in CLAUDE.md.
   */
  consumed: number | null;
  target: number;
  /** Compact for Home; default matches Fuel card. */
  compact?: boolean;
};

/**
 * Calorie progress with a faux ring (border arc) + bar.
 * No SVG dependency — clear enough for the Home/Fuel dashboards.
 */
export function CalorieProgress({ consumed, target, compact }: Props) {
  // The zero-vs-absent rule lives in lib/calorie-ring.ts, where it is tested.
  const state = calorieRingState(consumed, target);
  const logged = state.status !== 'empty';
  const over = state.status === 'over';
  const eaten = state.status === 'empty' ? 0 : state.eaten;
  const pct = state.status === 'empty' ? 0 : state.pct;
  const pctLabel = Math.round(pct * 100);
  const remaining =
    state.status === 'under' ? state.remaining : state.status === 'over' ? state.exceededBy : 0;
  const ringSize = compact ? 72 : 88;

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.topRow}>
        <View
          style={[
            styles.ring,
            {
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              borderColor: over ? colors.danger : colors.accent,
            },
          ]}
        >
          <View
            style={[
              styles.ringInner,
              {
                width: ringSize - 12,
                height: ringSize - 12,
                borderRadius: (ringSize - 12) / 2,
              },
            ]}
          >
            <Text style={[styles.ringPct, over && styles.over]}>
              {logged ? `${pctLabel}%` : '—'}
            </Text>
          </View>
        </View>
        <View style={styles.stats}>
          {logged ? (
            <>
              <Text style={styles.consumed}>{formatKcal(eaten)}</Text>
              <Text style={styles.label}>kcal eaten</Text>
              <Text style={[styles.remaining, over && styles.over]}>
                {over ? `${remaining} over` : `${remaining} left`}
              </Text>
              <Text style={styles.label}>of {formatKcal(target)} goal</Text>
            </>
          ) : (
            <>
              <Text style={styles.consumed}>{formatKcal(target)}</Text>
              <Text style={styles.label}>kcal target</Text>
              <Text style={styles.label}>Nothing logged yet</Text>
            </>
          )}
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

const styles = themedStyles(() => StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  wrapCompact: { padding: spacing.md },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  ring: {
    borderWidth: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  ringInner: {
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPct: { color: colors.accent, fontSize: 16, fontWeight: '900' },
  stats: { flex: 1 },
  consumed: { color: colors.accent, fontSize: 28, fontWeight: '900' },
  remaining: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 6 },
  over: { color: colors.danger, fontWeight: '900', textDecorationLine: 'underline' },
  label: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  track: {
    height: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 4,
  },
  fillOver: { backgroundColor: colors.danger },
}));
