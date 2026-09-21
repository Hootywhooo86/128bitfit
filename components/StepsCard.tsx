import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTodaySteps } from '@/lib/health/use-health';
import { colors, spacing } from '@/lib/theme';

/**
 * Steps on Home.
 *
 * Each state says what is actually true. A `0` here always means Health
 * Connect was read and reported no steps yet — it is never a stand-in for
 * "not connected" or "no provider", which get their own copy.
 */
export function StepsCard() {
  const { state, connect, openSettings } = useTodaySteps();

  if (state.status === 'checking') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Steps</Text>
        <Text style={styles.hint}>Checking…</Text>
      </View>
    );
  }

  if (state.status === 'unavailable') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.title}>Steps</Text>
        <Text style={styles.dash}>—</Text>
        <Text style={styles.hint}>Not available on this phone.</Text>
      </View>
    );
  }

  if (state.status === 'update') {
    return (
      <Pressable style={styles.wrap} onPress={openSettings}>
        <Text style={styles.title}>Steps</Text>
        <Text style={styles.dash}>—</Text>
        <Text style={styles.hint}>Health Connect needs updating — tap to open it.</Text>
      </Pressable>
    );
  }

  if (state.status === 'denied') {
    return (
      <Pressable style={styles.wrap} onPress={connect}>
        <View style={styles.row}>
          <Text style={styles.title}>Steps</Text>
          <Text style={styles.link}>Connect →</Text>
        </View>
        <Text style={styles.dash}>—</Text>
        <Text style={styles.hint}>Not connected to Health Connect.</Text>
      </Pressable>
    );
  }

  // Connected. A null reading means the day could not be read — still not zero.
  if (state.steps == null) {
    return (
      <Pressable style={styles.wrap} onPress={openSettings}>
        <Text style={styles.title}>Steps</Text>
        <Text style={styles.dash}>—</Text>
        <Text style={styles.hint}>No reading from Health Connect.</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.title}>Steps</Text>
        <Text style={styles.source}>Health Connect</Text>
      </View>
      <Text style={styles.value}>{state.steps.toLocaleString()}</Text>
      <Text style={styles.hint}>Today</Text>
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
    gap: spacing.xs,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontWeight: '700', fontSize: 15 },
  value: { color: colors.accent, fontWeight: '900', fontSize: 28 },
  /** Em dash for "no measurement" — deliberately not a 0. */
  dash: { color: colors.textMuted, fontWeight: '900', fontSize: 28 },
  hint: { color: colors.textMuted, fontSize: 12 },
  source: { color: colors.textMuted, fontSize: 11 },
  link: { color: colors.accent, fontWeight: '700', fontSize: 13 },
});
