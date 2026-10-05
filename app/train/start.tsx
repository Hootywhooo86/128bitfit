import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { Label, MenuRow, Note, Screen } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { listStartableRoutines, type StartableRoutine } from '@/db/start-queries';
import {
  getInProgressSession,
  getLastCompletedWorkoutSummary,
  repeatWorkout,
  startFreestyleWorkout,
  type WorkoutSummary,
} from '@/db/workout-queries';
import { describeLastRun, routineSummary } from '@/lib/routine-summary';
import { colors } from '@/lib/theme';

/**
 * Pick what to run before anything is written.
 *
 * Tapping a routine used to create a live session immediately — no look at
 * what was in it, and backing out left an abandoned session behind. Choosing
 * happens here, confirming happens on the preview, and the session is created
 * only when you say start.
 */
export default function StartWorkoutScreen() {
  const { ready } = useDb();
  const router = useRouter();
  const [routines, setRoutines] = useState<StartableRoutine[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<WorkoutSummary | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    try {
      const [list, active, previous] = await Promise.all([
        listStartableRoutines(),
        getInProgressSession(),
        getLastCompletedWorkoutSummary(),
      ]);
      setRoutines(list);
      setRunning(active?.id ?? null);
      setLast(previous && previous.exercises.length > 0 ? previous : null);
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const freestyle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const id = await startFreestyleWorkout();
      router.replace({ pathname: '/train/active', params: { id } });
    } catch (e) {
      Alert.alert('Could not start', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const repeat = async () => {
    if (busy || !last) return;
    setBusy(true);
    try {
      const id = await repeatWorkout(last.session.id);
      router.replace({ pathname: '/train/active', params: { id } });
    } catch (e) {
      Alert.alert('Could not start', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!ready || loading) {
    return (
      <Screen section="Start workout" back>
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen section="Start workout" back onRefresh={() => void load()}>
      {running ? (
        <Note>
          A session is already running. Opening it is probably what you want — starting another one
          leaves the first unfinished.
        </Note>
      ) : null}
      {running ? (
        <MenuRow
          icon="▶"
          name="Back to the session in progress"
          sub="Pick up where you left off"
          onPress={() => router.replace({ pathname: '/train/active', params: { id: running } })}
        />
      ) : null}

      <Label>SAVED ROUTINES</Label>
      {routines.length === 0 ? (
        <Note>
          No routines yet. Build one from Train, or start freestyle below and pick exercises as you
          go — a freestyle session can be saved as a routine afterwards.
        </Note>
      ) : (
        routines.map((r) => {
          const last = describeLastRun(r.lastRunAt);
          return (
            <MenuRow
              key={r.id}
              icon="▤"
              name={r.name}
              sub={[
                routineSummary(r.exerciseCount, r.setCount),
                last ? `last ${last}` : 'never run',
              ].join(' · ')}
              onPress={() =>
                router.push({ pathname: '/train/preview', params: { id: r.id } })
              }
            />
          );
        })
      )}

      {last ? (
        <>
          <Label>AGAIN</Label>
          <MenuRow
            icon="↻"
            name="Repeat last workout"
            sub={[
              describeLastRun(last.session.endedAt ?? last.session.startedAt),
              last.exercises
                .slice(0, 3)
                .map((e) => e.name)
                .join(', ') + (last.exercises.length > 3 ? ` +${last.exercises.length - 3}` : ''),
            ]
              .filter(Boolean)
              .join(' · ')}
            onPress={() => void repeat()}
          />
        </>
      ) : null}

      <Label>NO PLAN</Label>
      <MenuRow
        icon="✦"
        name="Freestyle workout"
        sub="Start empty and add exercises as you go"
        onPress={() => void freestyle()}
      />
      <Note>
        Freestyle still logs everything — sets, volume, muscle coverage. It just doesn&apos;t ask you
        to decide in advance.
      </Note>
    </Screen>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: 80, alignItems: 'center' },
});
