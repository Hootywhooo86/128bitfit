import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getWorkoutSummary, type WorkoutSummary } from '@/db/workout-queries';
import { useWorkoutEnergy } from '@/lib/health/use-workout-energy';
import type { EnergyResult } from '@/lib/workout-energy';
import { colors, spacing } from '@/lib/theme';

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function WorkoutSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [summary, setSummary] = useState<WorkoutSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // The session's own window, so heart rate is the workout's and not the day's.
  const window = React.useMemo(() => {
    const started = summary?.session.startedAt;
    const ended = summary?.session.endedAt;
    if (!started || !ended) return null;
    return { startedAt: new Date(started).getTime(), endedAt: new Date(ended).getTime() };
  }, [summary?.session.startedAt, summary?.session.endedAt]);
  const energy = useWorkoutEnergy(window);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const s = await getWorkoutSummary(decodeURIComponent(id));
      setSummary(s);
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!summary) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Summary not found.</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Workout complete', headerBackVisible: false }} />
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
        <Text style={styles.hero}>Nice work</Text>
        <Text style={styles.muted}>Session saved offline.</Text>

        <View style={styles.stats}>
          <Stat label="Duration" value={formatDuration(summary.durationMs)} />
          <Stat label="Exercises" value={String(summary.exerciseCount)} />
          <Stat
            label="Sets"
            value={`${summary.completedSets}/${summary.totalSets}`}
          />
        </View>

        <EnergyCard energy={energy} />

        <Text style={styles.section}>Exercises</Text>
        {summary.exercises.map((ex, i) => (
          <View key={`${ex.name}-${i}`} style={styles.row}>
            <Text style={styles.rowTitle}>{ex.name}</Text>
            <Text style={styles.rowMeta}>{ex.setCount} sets</Text>
          </View>
        ))}

        <Pressable style={styles.btn} onPress={() => router.replace('/(tabs)/train')}>
          <Text style={styles.btnText}>Back to Train</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

/**
 * Energy burned, with its provenance attached.
 *
 * A measured figure and an estimate are never rendered the same way: the
 * estimate carries the word "estimate" and the reason it might be wrong. That
 * distinction is the whole reason this card exists rather than a fourth number
 * in the stat row, where it would read as measured like the other three.
 */
function EnergyCard({ energy }: { energy: EnergyResult | null }) {
  // Still reading. A number that appears and then changes is worse than a gap.
  if (!energy) return null;

  if (energy.status === 'unknown') {
    return (
      <View style={styles.energy}>
        <Text style={styles.energyLabel}>ENERGY</Text>
        <Text style={styles.energyNote}>
          No figure for this one — {energy.missing.join(' and ')} missing. Add it and future
          sessions get one.
        </Text>
      </View>
    );
  }

  const measured = energy.status === 'measured';
  return (
    <View style={styles.energy}>
      <Text style={styles.energyLabel}>ENERGY</Text>
      <Text style={styles.energyValue}>
        {energy.kcal.toLocaleString()} kcal{measured ? '' : ' (estimate)'}
      </Text>
      <Text style={styles.energyNote}>
        {measured ? `Measured by ${energy.source}.` : `${energy.basis}. ${energy.caveat}`}
      </Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  hero: { color: colors.accent, fontSize: 28, fontWeight: '800' },
  muted: { color: colors.textMuted, marginTop: 4, marginBottom: spacing.lg },
  stats: { flexDirection: 'row', gap: 8, marginBottom: spacing.lg },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  statValue: { color: colors.text, fontWeight: '800', fontSize: 18 },
  energy: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  energyLabel: { color: colors.textMuted, fontSize: 11, letterSpacing: 1, fontWeight: '700' },
  energyValue: { color: colors.text, fontWeight: '800', fontSize: 22, marginTop: 6 },
  energyNote: { color: colors.textDim, fontSize: 12, lineHeight: 17, marginTop: 6 },
  statLabel: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  section: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowTitle: { color: colors.text, fontWeight: '700', flex: 1, marginRight: 8 },
  rowMeta: { color: colors.textMuted, fontSize: 12 },
  btn: {
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
  },
  btnText: { color: colors.chipActiveText, fontWeight: '800', textAlign: 'center', fontSize: 16 },
});
