import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Label, Note, Screen } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { getRoutinePreview, type RoutinePreview } from '@/db/start-queries';
import { getInProgressSession, startRoutineWorkout } from '@/db/workout-queries';
import { routineSummary } from '@/lib/routine-summary';
import { colors, fonts, spacing } from '@/lib/theme';

/**
 * See the whole routine before committing to it.
 *
 * Nothing is written until START is pressed, so backing out of here costs
 * nothing — no half-finished session left in the database, which is what
 * happened when tapping a routine created one straight away.
 */
export default function RoutinePreviewScreen() {
  const { ready } = useDb();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const routineId = id ? decodeURIComponent(id) : null;

  const [data, setData] = useState<RoutinePreview | null>(null);
  const [missing, setMissing] = useState(false);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!ready || !routineId) return;
    const [preview, active] = await Promise.all([
      getRoutinePreview(routineId),
      getInProgressSession(),
    ]);
    if (!preview) setMissing(true);
    setData(preview);
    setRunning(Boolean(active));
  }, [ready, routineId]);

  useEffect(() => {
    void load();
  }, [load]);

  const begin = async () => {
    if (!routineId || busy) return;
    setBusy(true);
    try {
      const sessionId = await startRoutineWorkout(routineId);
      router.replace({ pathname: '/train/active', params: { id: sessionId } });
    } catch (e) {
      Alert.alert('Could not start', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <Screen section="Start workout" back>
        <Note>That routine no longer exists. It may have been deleted since this screen opened.</Note>
      </Screen>
    );
  }

  if (!ready || !data) {
    return (
      <Screen section="Start workout" back>
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen section="Start workout" back>
      <Text style={s.title}>{data.routine.name}</Text>
      <Text style={s.sub}>{routineSummary(data.exercises.length, data.setCount)}</Text>

      {running ? (
        <Note>
          A session is already running. Starting this one leaves that one unfinished.
        </Note>
      ) : null}

      <Label>WHAT&apos;S IN IT</Label>
      {data.exercises.length === 0 ? (
        <Note>
          This routine has no exercises in it, so there would be nothing to log. Edit it from Train
          first.
        </Note>
      ) : (
        data.exercises.map((e, i) => (
          <Card key={`${e.exerciseId}-${i}`}>
            <Text style={s.name}>{e.name}</Text>
            <Text style={s.meta}>
              {[
                e.primaryMuscles[0],
                e.equipment,
                e.targetSets ? `${e.targetSets} sets` : null,
                e.targetReps ? `${e.targetReps} reps` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
            {e.bestWeight != null ? (
              <Text style={s.best}>Best {Math.round(e.bestWeight)} lb</Text>
            ) : null}
          </Card>
        ))
      )}

      {data.exercises.length > 0 ? (
        <Pressable style={[s.start, busy && { opacity: 0.6 }]} onPress={() => void begin()}>
          <Text style={s.startT}>{busy ? 'STARTING…' : 'START WORKOUT'}</Text>
        </Pressable>
      ) : null}

      <Note>
        Nothing is logged until you start. Targets are a starting point — what you actually lift is
        what gets recorded.
      </Note>
    </Screen>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: 80, alignItems: 'center' },
  title: { color: colors.text, fontSize: 22, fontFamily: fonts.bodySemi },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 4, fontFamily: fonts.body },
  name: { color: colors.text, fontSize: 15, fontFamily: fonts.bodySemi },
  meta: { color: colors.textMuted, fontSize: 12.5, marginTop: 4, fontFamily: fonts.body },
  best: { color: colors.textDim, fontSize: 11.5, marginTop: 4, fontFamily: fonts.body },
  start: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  startT: { fontFamily: fonts.pixel, fontSize: 11, color: colors.onAccent, letterSpacing: 1 },
});
