import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MuscleMap } from '@/components/MuscleMap';
import { MUSCLE_LABELS, neglectedMuscles, rankMuscles, type MuscleTally } from '@/lib/muscle-load';
import { colors, spacing } from '@/lib/theme';

/**
 * Muscle load on Home — the app's signature view, so it sits up front rather
 * than buried behind a tab.
 */
export function MuscleLoadCard({ tally }: { tally: MuscleTally }) {
  const router = useRouter();
  const ranked = rankMuscles(tally).filter((r) => r.sets > 0);
  const neglected = neglectedMuscles(tally);

  return (
    <Pressable style={styles.card} onPress={() => router.push('/progress')}>
      <View style={styles.header}>
        <Text style={styles.title}>Muscle load</Text>
        <Text style={styles.link}>Last 7 days →</Text>
      </View>

      <MuscleMap tally={tally} width={104} showLegend={false} />

      {ranked.length > 0 ? (
        <Text style={styles.hint} numberOfLines={2}>
          Most worked: {ranked.slice(0, 3).map((r) => MUSCLE_LABELS[r.muscle]).join(', ')}
          {neglected.length > 0
            ? ` · Least: ${neglected.map((m) => MUSCLE_LABELS[m]).join(', ')}`
            : ''}
        </Text>
      ) : (
        // Grey everywhere is the honest first-run state, and it wants filling in.
        <Text style={styles.hint}>No completed workouts this week yet.</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: colors.text, fontWeight: '700', fontSize: 15 },
  link: { color: colors.accent, fontWeight: '700', fontSize: 12 },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
