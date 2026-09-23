import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MuscleLoadCard } from '@/components/MuscleLoadCard';
import { ReadinessCard } from '@/components/ReadinessCard';
import { StepsCard } from '@/components/StepsCard';
import { WeightCard } from '@/components/WeightCard';
import { Bar, Card, CardHead, Label, MenuRow, Screen, SessionCard, Stat3 } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { addWater, getDayFuelSummary } from '@/db/food-queries';
import { countRecentSets, getMuscleTally, periodFor } from '@/db/muscle-queries';
import { getAppSettings } from '@/db/settings-queries';
import { getLatestWeightEntry, weightInKg } from '@/db/weight-queries';
import type { WeightEntry } from '@/db/schema';
import {
  countCompletedSessions,
  listUntaggedExercises,
  getInProgressSession,
  getLastCompletedWorkoutSummary,
  type WorkoutSummary,
} from '@/db/workout-queries';
import { useTodaySteps } from '@/lib/health/use-health';
import { useLatestWeight } from '@/lib/health/use-weight';
import { formatKg } from '@/lib/weight-source';
import { emptyTally, type MuscleTally } from '@/lib/muscle-load';
import type { WeightUnit } from '@/db/settings-queries';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * Home, laid out as prototype/app-shell.html: the session card, TODAY tiles,
 * WATER, PROGRESS, the stat row, muscle coverage, then the week.
 *
 * Every number here is real or absent. A tile with no reading shows a dash, not
 * a zero — see the empty-state table in CLAUDE.md.
 */
export default function HomeScreen() {
  const { ready } = useDb();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const { state: healthState, refresh: refreshHealth } = useTodaySteps();
  const [refreshing, setRefreshing] = useState(false);

  const [calories, setCalories] = useState<number | null>(null);
  const [waterMl, setWaterMl] = useState(0);
  const [waterTarget, setWaterTarget] = useState(2500);
  const [lastWorkout, setLastWorkout] = useState<WorkoutSummary | null>(null);
  const [inProgress, setInProgress] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [latestWeight, setLatestWeight] = useState<WeightEntry | null>(null);
  const [units, setUnits] = useState<WeightUnit>('lb');
  const [tally, setTally] = useState<MuscleTally>(emptyTally());
  const [recentSets, setRecentSets] = useState<number | null>(null);
  const [untagged, setUntagged] = useState<{ count: number; sets: number }>({ count: 0, sets: 0 });

  const refresh = useCallback(async () => {
    if (!ready) return;
    try {
      const since = periodFor(7).since;
      const [appSettings, fuel, workout, active, weight, count, t, rs, un] = await Promise.all([
        getAppSettings(),
        getDayFuelSummary(new Date()),
        getLastCompletedWorkoutSummary(),
        getInProgressSession(),
        getLatestWeightEntry(),
        countCompletedSessions(),
        getMuscleTally(since),
        countRecentSets(2),
        listUntaggedExercises(),
      ]);
      setUnits(appSettings.units);
      setCalories(fuel.logs.length > 0 ? fuel.totals.calories : null);
      setWaterMl(fuel.waterMl);
      setWaterTarget(fuel.goals.waterTargetMl);
      setLastWorkout(workout);
      setInProgress(active != null);
      setLatestWeight(weight);
      setSessionCount(count);
      setTally(t);
      setRecentSets(rs);
      setUntagged({ count: un.length, sets: un.reduce((n, e) => n + e.setCount, 0) });
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  /**
   * Pull to re-read everything, including the phone's health data.
   *
   * Focusing the screen already re-reads the database, but steps and sleep
   * come from Health Connect and change while the app is open — walking with
   * Home on screen used to leave the step count stale with no way to nudge it
   * short of leaving the tab and coming back.
   */
  const pullToRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.allSettled([refresh(), refreshHealth()]).finally(() => setRefreshing(false));
  }, [refresh, refreshHealth]);

  const water = async (ml: number) => {
    const next = Math.max(0, waterMl + ml);
    setWaterMl(next);
    await addWater(ml);
    void refresh();
  };

  if (!ready || loading) {
    return (
      <Screen section="Home">
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  const waterPct = waterTarget > 0 ? (waterMl / waterTarget) * 100 : 0;

  return (
    <Screen section="Home" onRefresh={pullToRefresh} refreshing={refreshing}>
      <SessionCard
        title={inProgress ? 'SESSION IN PROGRESS' : 'START TRAINING'}
        sub={
          inProgress
            ? 'Pick up where you left off'
            : lastWorkout
              ? `Last: ${lastWorkout.exercises.map((e) => e.name).join(' · ') || 'Workout complete'}`
              : 'No workouts yet — pick something to run'
        }
        action={inProgress ? 'RESUME' : 'START WORKOUT'}
        onPress={() => router.push('/(tabs)/train')}
      />

      <Label>TODAY</Label>
      <Stat3
        items={[
          // A real reading from Health Connect. 0 steps is a reading and shows
          // as 0; not connected shows a dash, and the card below offers to
          // connect. These are different facts — see CLAUDE.md.
          {
            value: healthState.status === 'ready' && healthState.steps != null
              ? healthState.steps.toLocaleString()
              : null,
            label: 'STEPS',
          },
          { value: calories == null ? null : Math.round(calories).toLocaleString(), label: 'KCAL' },
          { value: waterMl > 0 ? `${(waterMl / 1000).toFixed(1)}L` : null, label: 'WATER' },
        ]}
      />

      {healthState.status !== 'ready' ? <StepsCard /> : null}

      <ReadinessCard recentSets={recentSets} />

      <Label>WATER</Label>
      <Card>
        <CardHead
          title={`${waterMl} / ${waterTarget} ML`}
          note={`${Math.round(waterPct)}% · ${Math.round(waterMl / 29.574)} fl oz`}
        />
        <Bar pct={waterPct} height={10} />
        <View style={s.wadd}>
          {[250, 500, 750].map((ml) => (
            <Pressable key={ml} style={s.waddBtn} onPress={() => void water(ml)}>
              <Text style={s.waddT}>+{ml}</Text>
            </Pressable>
          ))}
          <Pressable style={s.waddBtn} onPress={() => void water(-250)}>
            <Text style={[s.waddT, { color: colors.textDim, fontSize: 16 }]}>−</Text>
          </Pressable>
        </View>
        <Text style={s.wfoot}>
          One glass = 250 ml (8 fl oz) · goal {waterTarget} ml (
          {Math.round(waterTarget / 29.574)} fl oz)
        </Text>
      </Card>

      <Label>PROGRESS</Label>
      <WeightCard
        local={latestWeight}
        units={units}
        onPress={() => router.push('/home/weight')}
      />

      <Stat3
        items={[
          { value: sessionCount > 0 ? String(sessionCount) : null, label: 'WORKOUTS' },
          { value: null, label: 'WEEK STREAK' },
          { value: null, label: 'LB THIS WK' },
        ]}
      />

      <View style={{ height: 10 }} />
      <MuscleLoadCard tally={tally} untagged={untagged} />

      {lastWorkout ? (
        <MenuRow
          icon="◷"
          name="Recent sessions"
          sub={`${lastWorkout.completedSets} sets · ${lastWorkout.exerciseCount} exercises`}
          onPress={() => router.push('/(tabs)/train')}
        />
      ) : null}

      <Label>THIS WEEK</Label>
      <MenuRow
        icon="✦"
        name="Weekly check-in"
        sub={
          sessionCount === 0
            ? 'Log a couple of sessions and the coach will have something to say'
            : 'Ready when you are'
        }
        onPress={() => router.push('/(tabs)/coach')}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: 80, alignItems: 'center' },
  wadd: { flexDirection: 'row', gap: 6, marginTop: 12 },
  waddBtn: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
  },
  waddT: { color: colors.text, fontSize: 13, fontFamily: fonts.bodySemi },
  wfoot: { fontSize: 11.5, color: colors.textDim, marginTop: 10, textAlign: 'center', fontFamily: fonts.body },
  jtop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  pct: { fontSize: 30, fontFamily: fonts.bodyBold, color: colors.text, letterSpacing: -1.2 },
  rem: { fontSize: 12.5, color: colors.textMuted, fontFamily: fonts.body },
  note: { fontSize: 12.5, color: colors.textDim, fontFamily: fonts.body, lineHeight: 18 },
});
