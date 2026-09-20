import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getWorkoutSummary, type WorkoutSummary } from '@/db/workout-queries';
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
