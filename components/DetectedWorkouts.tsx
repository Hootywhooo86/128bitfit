import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Label, MenuRow, Note } from '@/components/ui';
import { getDetectedWorkouts, type DetectedState, type DetectedWorkout } from '@/db/detected-queries';
import { sourceName, workoutTypeName } from '@/lib/detected-workouts';
import { useHealthRefresh } from '@/lib/health/use-health-refresh';

function when(w: DetectedWorkout): string {
  const d = new Date(w.startMs);
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const day = sameDay(d, today)
    ? 'Today'
    : sameDay(d, yesterday)
      ? 'Yesterday'
      : d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

/**
 * Workouts a watch or another app recorded — an auto-detected walk, a class —
 * at the bottom of Home, so nothing done goes uncounted. Tap one for its
 * heart rate and calories, or to add it to your cardio.
 */
export function DetectedWorkouts() {
  const router = useRouter();
  const [state, setState] = useState<DetectedState | null>(null);

  const load = useCallback(() => {
    void getDetectedWorkouts()
      .then(setState)
      .catch(() => setState({ status: 'ready', workouts: [] }));
  }, []);
  useFocusEffect(load);
  useHealthRefresh(load);

  if (!state) return null;

  return (
    <>
      <Label>DETECTED WORKOUTS</Label>
      {state.status === 'unavailable' ? (
        <Note>Health Connect isn&apos;t available on this phone, so workouts from a watch can&apos;t be picked up.</Note>
      ) : state.status === 'not_connected' ? (
        <MenuRow
          icon="◐"
          name="Connect Health Connect"
          sub="To see walks, runs and workouts your watch picks up on its own"
          onPress={() => router.push('/settings/health')}
        />
      ) : state.workouts.length === 0 ? (
        <Note>Nothing from your watch or other apps in the last 7 days that you haven&apos;t already logged here.</Note>
      ) : (
        state.workouts.map((w) => {
          const mins = Math.round((w.endMs - w.startMs) / 60000);
          const sub = [when(w), `${mins} min`, sourceName(w.source)].join(' · ');
          const value =
            w.activeCalories != null
              ? `${w.activeCalories} kcal`
              : w.heartRateAvg != null
                ? `${w.heartRateAvg} bpm`
                : undefined;
          return (
            <MenuRow
              key={w.id}
              icon="◉"
              name={workoutTypeName(w.type, w.title)}
              sub={sub}
              value={value}
              onPress={() =>
                router.push({
                  pathname: '/home/detected',
                  params: {
                    id: w.id,
                    type: String(w.type),
                    title: w.title ?? '',
                    start: String(w.startMs),
                    end: String(w.endMs),
                    source: w.source ?? '',
                    kcal: w.activeCalories != null ? String(w.activeCalories) : '',
                    dist: w.distanceM != null ? String(Math.round(w.distanceM)) : '',
                  },
                })
              }
            />
          );
        })
      )}
    </>
  );
}
