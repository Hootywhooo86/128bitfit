import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Hourglass } from '@/components/fx/Hourglass';
import { useAccent } from '@/lib/accent';
import { colors, spacing, themedStyles } from '@/lib/theme';
import { formatRestClock, useRestTimer } from '@/lib/rest-timer';

export function RestTimerBar() {
  const timer = useRestTimer();
  const accent = useAccent();
  if (!timer.running && timer.endsAt == null) return null;
  const left = timer.totalSeconds > 0 ? timer.remainingSeconds / timer.totalSeconds : 0;

  return (
    <View style={styles.bar}>
      <View style={styles.left}>
        <View style={styles.glass}>
          <Hourglass left={left} color={accent} />
        </View>
        <Text style={styles.label}>Rest</Text>
        <Text style={styles.clock}>{formatRestClock(timer.remainingSeconds)}</Text>
      </View>
      <View style={styles.actions}>
        {/*
          Both directions. A rest you want to cut short is as common as one you
          want to stretch — starting the next set early was previously only
          possible by skipping the whole thing.
        */}
        <Pressable style={styles.btn} onPress={() => timer.addSeconds(-15)}>
          <Text style={styles.btnText}>−15</Text>
        </Pressable>
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

const styles = themedStyles(() => StyleSheet.create({
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
  glass: { alignSelf: 'center' },
  label: { color: colors.accent, fontWeight: '700', fontSize: 13, letterSpacing: 1 },
  clock: { color: colors.text, fontWeight: '800', fontSize: 28, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 8 },
  btn: {
    backgroundColor: colors.surface,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skip: { borderColor: colors.accent },
  btnText: { color: colors.text, fontWeight: '700' },
}));
