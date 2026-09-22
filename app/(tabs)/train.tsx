import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { Label, MenuRow, Screen, SessionCard } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { ensureStarterRoutines } from '@/db/seed-routines';
import {
  discardSession,
  getInProgressSession,
  listRoutines,
  startFreestyleWorkout,
  startRoutineWorkout,
} from '@/db/workout-queries';
import type { Routine, WorkoutSession } from '@/db/schema';
import { colors } from '@/lib/theme';

export default function TrainScreen() {
  const router = useRouter();
  const { ready, exerciseCount } = useDb();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [inProgress, setInProgress] = useState<WorkoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      await ensureStarterRoutines();
      const [r, session] = await Promise.all([listRoutines(), getInProgressSession()]);
      setRoutines(r);
      setInProgress(session);
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const startFreestyle = async () => {
    if (busy) return;
    if (inProgress) {
      Alert.alert(
        'Workout in progress',
        'Resume the current workout or discard it before starting a new one.'
      );
      return;
    }
    setBusy(true);
    try {
      const id = await startFreestyleWorkout();
      router.push(`/train/active?id=${encodeURIComponent(id)}`);
    } finally {
      setBusy(false);
    }
  };

  const startRoutine = async (routineId: string) => {
    if (busy) return;
    if (inProgress) {
      Alert.alert(
        'Workout in progress',
        'Resume the current workout or discard it before starting a new one.'
      );
      return;
    }
    setBusy(true);
    try {
      const id = await startRoutineWorkout(routineId);
      router.push(`/train/active?id=${encodeURIComponent(id)}`);
    } finally {
      setBusy(false);
    }
  };

  const onDiscard = () => {
    if (!inProgress) return;
    Alert.alert('Discard workout?', 'Sets already logged will be kept but marked discarded.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await discardSession(inProgress.id);
          setInProgress(null);
        },
      },
    ]);
  };

  if (!ready || loading) {
    return (
      <Screen section="Train">
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  const todays = routines[0];

  return (
    <Screen section="Train">
      {inProgress ? (
        <SessionCard
          title="SESSION IN PROGRESS"
          sub={`Started ${
            inProgress.startedAt
              ? new Date(inProgress.startedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '—'
          }`}
          action="RESUME"
          onPress={() => router.push(`/train/active?id=${encodeURIComponent(inProgress.id)}`)}
        />
      ) : (
        <SessionCard
          title={todays ? todays.name.toUpperCase() : 'FREESTYLE'}
          sub={todays ? 'Scheduled today · or pick something else' : 'Pick exercises as you go'}
          action="START WORKOUT"
          onPress={() => (todays ? void startRoutine(todays.id) : void startFreestyle())}
        />
      )}

      {inProgress ? (
        <MenuRow icon="✕" name="Discard session" sub="Nothing logged is kept" onPress={onDiscard} />
      ) : null}

      <Label>BUILD</Label>
      {routines.map((r) => (
        <MenuRow
          key={r.id}
          icon="▤"
          name={r.name}
          sub={r.notes ?? 'Ready to run'}
          onPress={() => void startRoutine(r.id)}
        />
      ))}
      <MenuRow
        icon="✎"
        name="Freestyle session"
        sub="Start empty and pick as you go"
        onPress={() => void startFreestyle()}
      />
      <MenuRow
        icon="▦"
        name="Exercise library"
        sub="Browse, or create your own"
        value={String(exerciseCount)}
        onPress={() => router.push('/exercise')}
      />

      <Label>REVIEW</Label>
      <MenuRow
        icon="◷"
        name="Workout history"
        sub="Every session — open or delete one"
        onPress={() => router.push('/train/history')}
      />
      <MenuRow
        icon="◍"
        name="Muscle map"
        sub="What you've hit, and what you haven't"
        onPress={() => router.push('/progress')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: 80, alignItems: 'center' },
});
