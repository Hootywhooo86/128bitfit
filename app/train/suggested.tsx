import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Label, Note, Screen } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { getDefaultRestSeconds } from '@/db/rest-settings';
import { suggestWorkout, type WorkoutSuggestion } from '@/db/gap-queries';
import { createRoutine, startRoutineWorkout } from '@/db/workout-queries';
import { MUSCLE_LABELS, type MuscleGroup } from '@/lib/muscle-load';
import { colors, fonts, spacing, themedStyles } from '@/lib/theme';

const SETS = 3;
const REPS = 10;

/**
 * A session built from the muscles you have not trained in the window.
 *
 * The picking is local arithmetic, not a model call — it has to work in a gym
 * with no signal and with no API key set up, and "which muscles got no sets in
 * 30 days" is counting, not judgement.
 *
 * It is allowed to say there is nothing to suggest. A screen that always finds
 * a gap would be inventing one, and per the brief a coach that finds a problem
 * every time is noise.
 */
export default function SuggestedWorkoutScreen() {
  const { ready } = useDb();
  const router = useRouter();
  const [data, setData] = useState<WorkoutSuggestion | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!ready) return;
    setData(await suggestWorkout(30));
  }, [ready]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Saves it as a routine first, so it is still there after the session. */
  const start = async () => {
    if (!data || data.exercises.length === 0 || busy) return;
    setBusy(true);
    try {
      const rest = await getDefaultRestSeconds();
      const routineId = await createRoutine({
        name: `Catch-up · ${new Date().toLocaleDateString()}`,
        exercises: data.exercises.map((s) => ({
          exerciseId: s.exercise.id,
          targetSets: SETS,
          targetReps: REPS,
          restSeconds: rest,
          notes: null,
        })),
      });
      const sessionId = await startRoutineWorkout(routineId);
      router.replace({ pathname: '/train/active', params: { id: sessionId } });
    } catch (e) {
      Alert.alert('Could not start it', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!ready || !data) {
    return (
      <Screen section="Suggested" back>
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  const { report } = data;

  return (
    <Screen section="Suggested" back onRefresh={() => void load()}>
      {report.status === 'no_history' ? (
        <>
          <Label>NOTHING TO GO ON YET</Label>
          <Note>
            No completed sets in the last {data.days} days, so there is nothing to compare
            against — every muscle would read as neglected for the same uninformative reason.
            Log a couple of sessions and this will have something useful to say.
          </Note>
        </>
      ) : report.status === 'untrustworthy' ? (
        <>
          <Label>CAN&apos;T TELL YET</Label>
          <Note>
            {report.untaggedSets} of your {report.untaggedSets + report.taggedSets} sets came from
            exercises with no muscles on them, so most of your training cannot be attributed.
            Ranking what you skipped from the rest would be guessing.
          </Note>
          <Pressable style={s.secondary} onPress={() => router.push('/train/match-imported')}>
            <Text style={s.secondaryT}>Tag those exercises</Text>
          </Pressable>
        </>
      ) : data.exercises.length === 0 ? (
        <>
          <Label>NOTHING SKIPPED</Label>
          <Note>
            Every muscle group has had at least some work in the last {data.days} days. There is
            no gap to fill, which is a good answer — pick a routine instead.
          </Note>
        </>
      ) : (
        <>
          <Label>NOT TRAINED IN {data.days} DAYS</Label>
          <View style={s.chips}>
            {report.neglected
              .filter((g) => g.sets === 0)
              .slice(0, 8)
              .map((g) => (
                <View key={g.muscle} style={s.chip}>
                  <Text style={s.chipT}>{MUSCLE_LABELS[g.muscle as MuscleGroup]}</Text>
                </View>
              ))}
          </View>

          <Label>A SESSION THAT HITS THEM</Label>
          {data.exercises.map((s2) => (
            <Card key={s2.exercise.id}>
              <Text style={s.name}>{s2.exercise.name}</Text>
              <Text style={s.meta}>
                {SETS} × {REPS} · covers{' '}
                {s2.covers.map((m) => MUSCLE_LABELS[m as MuscleGroup]).join(', ')}
                {s2.exercise.familiar ? ' · done before' : ''}
              </Text>
            </Card>
          ))}

          <Note>
            Sets and reps are a starting point, not a prescription. What you actually lift is what
            gets logged.
          </Note>

          <Pressable style={[s.start, busy && { opacity: 0.6 }]} onPress={() => void start()}>
            <Text style={s.startT}>{busy ? 'STARTING…' : 'START THIS SESSION'}</Text>
          </Pressable>
        </>
      )}
    </Screen>
  );
}

const s = themedStyles(() => StyleSheet.create({
  center: { paddingVertical: 80, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm },
  chip: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipT: { color: colors.text, fontSize: 12, fontFamily: fonts.body },
  name: { color: colors.text, fontSize: 15, fontFamily: fonts.bodySemi },
  meta: { color: colors.textMuted, fontSize: 12.5, marginTop: 4, fontFamily: fonts.body },
  start: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  startT: { fontFamily: fonts.pixel, fontSize: 10, color: colors.onAccent, letterSpacing: 1 },
  secondary: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderBright,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  secondaryT: { color: colors.text, fontSize: 13, fontFamily: fonts.bodySemi },
}));
