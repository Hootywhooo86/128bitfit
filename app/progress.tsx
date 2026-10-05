import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '@/components/ui';
import { Stack, useFocusEffect } from 'expo-router';
import { MuscleMap } from '@/components/MuscleMap';
import { useDb } from '@/db/DatabaseProvider';
import { getMuscleRoles, getMuscleTally, periodFor } from '@/db/muscle-queries';
import { MUSCLE_LABELS, emptyTally, loadLevel, neglectedMuscles, rankMuscles, type MuscleTally, emptyRoles, type MuscleRoles } from '@/lib/muscle-load';
import { colors, muscleHeat, spacing, themedStyles } from '@/lib/theme';

const PERIODS = [7, 30, 90] as const;

export default function ProgressScreen() {
  const { ready } = useDb();
  const [days, setDays] = useState<(typeof PERIODS)[number]>(7);
  const [tally, setTally] = useState<MuscleTally>(emptyTally());
  const [roles, setRoles] = useState<MuscleRoles>(emptyRoles());
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      let alive = true;
      setLoading(true);
      void (async () => {
        const t = await getMuscleTally(periodFor(days).since);
        setRoles(await getMuscleRoles(periodFor(days).since));
        if (alive) {
          setTally(t);
          setLoading(false);
        }
      })();
      return () => {
        alive = false;
      };
    }, [ready, days])
  );

  const ranked = rankMuscles(tally).filter((r) => r.sets > 0);
  const neglected = neglectedMuscles(tally);
  const trainedAnything = ranked.length > 0;

  return (
    <Screen section="Muscle map" back>
      <Stack.Screen options={{ title: 'Muscle load' }} />

      <View style={styles.tabs}>
        {PERIODS.map((d) => (
          <Pressable
            key={d}
            style={[styles.tab, days === d && styles.tabOn]}
            onPress={() => setDays(d)}
          >
            <Text style={[styles.tabText, days === d && styles.tabTextOn]}>{d}d</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <MuscleMap roles={roles} width={130} />
          </View>

          {trainedAnything ? (
            <>
              <Text style={styles.section}>Sets per muscle</Text>
              <View style={styles.card}>
                {ranked.map((r) => (
                  <View key={r.muscle} style={styles.row}>
                    <View
                      style={[styles.dot, { backgroundColor: muscleHeat[loadLevel(r.sets)] }]}
                    />
                    <Text style={styles.rowName}>{MUSCLE_LABELS[r.muscle]}</Text>
                    <Text style={styles.rowSets}>{r.sets}</Text>
                  </View>
                ))}
              </View>

              {neglected.length > 0 ? (
                <View style={styles.card}>
                  <Text style={styles.hint}>
                    Least worked in this window: {neglected.map((m) => MUSCLE_LABELS[m]).join(', ')}.
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.card}>
              {/* Grey everywhere is honest, and it visibly wants filling in. */}
              <Text style={styles.hint}>
                No completed workouts in the last {days} days, so every muscle is grey. Log a
                session and it starts filling in.
              </Text>
            </View>
          )}

          <Text style={styles.footnote}>
            A set counts fully for the muscle an exercise targets and half for the ones it
            assists. Only completed sets of finished workouts count.
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  center: { paddingVertical: spacing.xl, alignItems: 'center' },
  tabs: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    backgroundColor: colors.chip,
    alignItems: 'center',
  },
  tabOn: { backgroundColor: colors.chipActive },
  tabText: { color: colors.textMuted, fontWeight: '700' },
  tabTextOn: { color: colors.chipActiveText },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  section: {
    color: colors.text,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  dot: { width: 10, height: 10, borderRadius: 2 },
  rowName: { color: colors.text, flex: 1, fontSize: 13 },
  rowSets: { color: colors.accent, fontWeight: '800', fontSize: 13 },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  footnote: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: spacing.md },
}));
