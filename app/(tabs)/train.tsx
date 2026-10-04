import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { Label, MenuRow, Screen, SessionCard } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { listActiveInjuries } from '@/db/injury-queries';
import { getWeekPlan } from '@/db/schedule-settings';
import { getSetting } from '@/db/settings-queries';
import { countLibraryExercises } from '@/db/queries';
import { ensureStarterRoutines } from '@/db/seed-routines';
import {
  discardSession,
  getInProgressSession,
  listRoutines,
} from '@/db/workout-queries';
import type { Routine, WorkoutSession } from '@/db/schema';
import { planFor, sessionsPerWeek, type WeekPlan } from '@/lib/schedule';
import { parsePass } from '@/lib/gym-pass';
import { colors } from '@/lib/theme';

function gymPassSaved(raw: string | null): boolean {
  const p = parsePass(raw);
  return !!(p.photoUri || p.memberNumber || p.barcode);
}

export default function TrainScreen() {
  const router = useRouter();
  const { ready } = useDb();
  // Queried on focus rather than read from the import result, which is set
  // once at launch and never moves — so an exercise you just made was not
  // counted until you restarted the app.
  const [exerciseCount, setExerciseCount] = useState(0);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [inProgress, setInProgress] = useState<WorkoutSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [activeInjuries, setActiveInjuries] = useState(0);
  const [hasPass, setHasPass] = useState(false);

  const refresh = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      await ensureStarterRoutines();
      const [r, session, exCount, week, hurts, pass] = await Promise.all([
        listRoutines(),
        getInProgressSession(),
        countLibraryExercises(),
        getWeekPlan(),
        listActiveInjuries(),
        getSetting('gym_pass'),
      ]);
      setRoutines(r);
      setInProgress(session);
      setExerciseCount(exCount);
      setPlan(week);
      setActiveInjuries(hurts.length);
      setHasPass(gymPassSaved(pass));
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

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


  const routineIds = new Set(routines.map((r) => r.id));
  const todays = plan ? planFor(plan, new Date(), routineIds) : null;
  const todaysRoutine = todays && todays !== 'rest' ? routines.find((r) => r.id === todays) : undefined;

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
      ) : todaysRoutine ? (
        <SessionCard
          title={todaysRoutine.name.toUpperCase()}
          sub="Planned for today · or pick something else"
          action="START WORKOUT"
          onPress={() => router.push({ pathname: '/train/preview', params: { id: todaysRoutine.id } })}
        />
      ) : (
        <SessionCard
          title={todays === 'rest' ? 'REST DAY' : 'START WORKOUT'}
          sub={
            routines.length > 0
              ? 'Pick a routine, or go freestyle'
              : 'Go freestyle, or build a routine first'
          }
          action="CHOOSE"
          onPress={() => router.push('/train/start')}
        />
      )}

      {inProgress ? (
        <MenuRow icon="✕" name="Discard session" sub="Nothing logged is kept" onPress={onDiscard} />
      ) : todaysRoutine ? (
        <MenuRow icon="▸" name="Pick something else" onPress={() => router.push('/train/start')} />
      ) : null}

      <Label>CARDIO</Label>
      <MenuRow
        icon="»"
        name="Cardio"
        sub="Walk, run or ride with a live map"
        onPress={() => router.push('/cardio')}
      />

      <Label>AT THE GYM</Label>
      <MenuRow
        icon="▥"
        name="Gym pass"
        sub="Your membership barcode"
        value={hasPass ? 'Saved' : 'Not set'}
        onPress={() => router.push('/train/gympass')}
      />

      <Label>BUILD</Label>
      <MenuRow
        icon="▤"
        name="Saved routines"
        sub="Your workouts, ready to run"
        value={String(routines.length)}
        onPress={() => router.push('/train/routines')}
      />
      <MenuRow
        icon="✎"
        name="Workout builder"
        sub="Plan a session now, run it later"
        onPress={() => router.push('/train/build-routine')}
      />
      <MenuRow
        icon="▦"
        name="Exercise library"
        sub="Browse, or create your own"
        value={String(exerciseCount)}
        onPress={() => router.push('/exercise')}
      />

      <Label>PLAN</Label>
      <MenuRow
        icon="▥"
        name="Schedule"
        sub="Which routine on which day"
        value={plan ? `${sessionsPerWeek(plan, routineIds)}/wk` : undefined}
        onPress={() => router.push('/train/schedule')}
      />
      <MenuRow
        icon="◈"
        name="What have I skipped?"
        sub="Builds a session from muscles with no sets in 30 days"
        onPress={() => router.push('/train/suggested')}
      />

      <Label>TOOLS</Label>
      <MenuRow
        icon="◉"
        name="Tools"
        sub="Plates, warm-ups, rest timer, readiness, photos, injuries"
        value={activeInjuries > 0 ? `${activeInjuries} injur${activeInjuries === 1 ? 'y' : 'ies'}` : undefined}
        onPress={() => router.push('/train/tools')}
      />

      <Label>REVIEW</Label>
      <MenuRow
        icon="◷"
        name="Workout history"
        sub="Every session — open or delete one"
        onPress={() => router.push('/train/history')}
      />
      <MenuRow
        icon="▲"
        name="Personal records"
        sub="Best lifts and estimated 1RM"
        onPress={() => router.push('/train/records')}
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
