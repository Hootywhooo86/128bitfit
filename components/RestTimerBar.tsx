import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@/lib/theme';
import { formatRestClock, useRestTimer } from '@/lib/rest-timer';

export function RestTimerBar() {
  const timer = useRestTimer();
  if (!timer.running && timer.endsAt == null) return null;

  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        <Text style={styles.label}>Rest</Text>
        <Text style={styles.clock}>{formatRestClock(timer.remainingSeconds)}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.btn} onPress={() => timer.addSeconds(15)}>
          <Text style={styles.btnText}>+15</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.skip]} onPress={timer.skip}>
          <Text style={styles.btnText}>Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.track,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  left: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  label: { color: colors.accent, fontWeight: '700', fontSize: 13, letterSpacing: 1 },
  clock: { color: colors.text, fontWeight: '800', fontSize: 28, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 8 },
  btn: {
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skip: { borderColor: colors.accent },
  btnText: { color: colors.text, fontWeight: '700' },
});
