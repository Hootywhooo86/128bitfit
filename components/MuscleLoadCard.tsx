import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MuscleMap } from '@/components/MuscleMap';
import {
  MUSCLE_LABELS,
  neglectedMuscles,
  rankMuscles,
  type MuscleRoles,
  type MuscleTally,
} from '@/lib/muscle-load';
import { colors, spacing } from '@/lib/theme';

/**
 * Muscle load on Home — the app's signature view, so it sits up front rather
 * than buried behind a tab.
 */
export function MuscleLoadCard({
  tally,
  roles,
  untagged,
}: {
  tally: MuscleTally;
  roles: MuscleRoles;
  /** Exercises with sets logged but no muscles recorded, and how many sets. */
  untagged?: { count: number; sets: number };
}) {
  const router = useRouter();
  const ranked = rankMuscles(tally).filter((r) => r.sets > 0);
  const neglected = neglectedMuscles(tally);

  return (
    <Pressable style={styles.card} onPress={() => router.push('/progress')}>
      <View style={styles.header}>
        <Text style={styles.title}>Muscle load</Text>
        <Text style={styles.link}>Last 7 days →</Text>
      </View>

      <MuscleMap roles={roles} width={104} showLegend={false} />

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

      {/*
        A grey map with a full history is the app looking broken while being
        honest. An import that did not say what its exercises work leaves
        nothing to colour, and saying so — with the way to fix it — beats
        leaving the user to conclude the feature does not work.
      */}
      {untagged && untagged.count > 0 ? (
        <Pressable
          style={styles.warn}
          onPress={() => router.push('/train/match-imported')}
          hitSlop={4}
        >
          <Text style={styles.warnText}>
            {untagged.sets} set{untagged.sets === 1 ? '' : 's'} colour nothing: {untagged.count}{' '}
            imported exercise{untagged.count === 1 ? '' : 's'} never said which muscles they work.
          </Text>
          <Text style={styles.warnLink}>Say what they were →</Text>
        </Pressable>
      ) : null}
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
  warn: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 4,
  },
  warnText: { color: colors.textMuted, fontSize: 11.5, lineHeight: 16 },
  warnLink: { color: colors.accent, fontSize: 11.5, fontWeight: '700' },
});
