import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  MUSCLE_LABELS,
  topTrained,
  type LoadLevel,
  type MuscleTally,
} from '@/lib/muscle-load';
import { colors, muscleHeat, spacing } from '@/lib/theme';

/**
 * The muscles you have trained most, on Home.
 *
 * This replaced the body silhouette. The map is honest but it is mostly grey
 * until every exercise is tagged, and grey tells you nothing about the week
 * you just had. A short ranked strip changes with your training and reads at
 * a glance.
 *
 * All seventeen muscle groups remain — this shows the top few of them, it
 * does not merge them into broader buckets. The map itself is still there
 * behind Progress for anyone who wants the whole picture.
 */
export function MuscleLoadCard({
  tally,
  untagged,
}: {
  tally: MuscleTally;
  /** Exercises with sets logged but no muscles recorded, and how many sets. */
  untagged?: { count: number; sets: number };
}) {
  const router = useRouter();
  const top = topTrained(tally, 6);

  return (
    <Pressable style={styles.card} onPress={() => router.push('/progress')}>
      <View style={styles.header}>
        <Text style={styles.title}>Muscle load</Text>
        <Text style={styles.link}>Last 7 days →</Text>
      </View>

      {top.length > 0 ? (
        <View style={styles.strip}>
          {top.map((t) => (
            <View key={t.muscle} style={[styles.chip, levelStyle[t.level]]}>
              <Text style={[styles.chipName, levelText[t.level]]} numberOfLines={1}>
                {MUSCLE_LABELS[t.muscle].toUpperCase()}
              </Text>
              <Text style={[styles.chipSets, levelText[t.level]]}>{round(t.sets)}</Text>
            </View>
          ))}
        </View>
      ) : (
        // Nothing trained is its own state, not six muscles reading zero.
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

/** Sets can be half, from an assisting muscle. One decimal, never three. */
function round(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/**
 * The one colour rule in the brief: yellow 1-3, orange 4-7, red 8+, grey for
 * untrained. muscleHeat is that scale, shared with the map so the two can
 * never drift into meaning different things.
 */
const levelStyle: Record<LoadLevel, { borderColor: string }> = {
  none: { borderColor: colors.border },
  light: { borderColor: muscleHeat.light },
  medium: { borderColor: muscleHeat.medium },
  heavy: { borderColor: muscleHeat.heavy },
};

const levelText: Record<LoadLevel, { color: string }> = {
  none: { color: colors.textMuted },
  light: { color: muscleHeat.light },
  medium: { color: muscleHeat.medium },
  heavy: { color: muscleHeat.heavy },
};

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    backgroundColor: colors.surfaceAlt,
    flexGrow: 1,
    flexBasis: '30%',
    borderWidth: 1,
    borderRadius: 9,
    paddingVertical: 9,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 3,
  },
  chipName: { fontSize: 9.5, letterSpacing: 0.6, fontWeight: '700' },
  chipSets: { fontSize: 17, fontWeight: '700' },
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
