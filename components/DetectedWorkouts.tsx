import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Label, MenuRow, Note } from '@/components/ui';
import { getDetectedWorkouts, readDetectedReadings, type DetectedState, type DetectedWorkout } from '@/db/detected-queries';
import { hasRealTitle, isUnidentified, sourceName, workoutTypeName, type DetectedSession } from '@/lib/detected-workouts';
import { useHealthRefresh } from '@/lib/health/use-health-refresh';
import { HEALTH_APP, HEALTH_UNAVAILABLE } from '@/lib/health/platform';

/** How many Home shows before "See all". */
const ON_HOME = 5;

export function detectedWhen(w: DetectedSession): string {
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

export function detectedMinutes(w: DetectedSession): string {
  const mins = Math.round((w.endMs - w.startMs) / 60000);
  return mins < 1 ? 'under 1 min' : `${mins} min`;
}

/** The watch didn't say what it was, and you haven't yet. */
export function needsName(w: DetectedSession & { labelled?: boolean }): boolean {
  return !w.labelled && isUnidentified(w.type) && !hasRealTitle(w.title);
}

/** The row's second line, leading with the nudge when it needs a name. */
export function detectedSub(w: DetectedSession & { labelled?: boolean }, tail: string): string {
  return [needsName(w) ? 'What was this? Tap to say' : null, detectedWhen(w), detectedMinutes(w), tail]
    .filter(Boolean)
    .join(' · ');
}

/** Opens one detected workout; its heart rate and calories are read there. */
export function openDetected(
  router: ReturnType<typeof useRouter>,
  w: DetectedSession & { labelled?: boolean; readings?: { distanceM: number | null } | null }
) {
  const dist = w.readings?.distanceM;
  router.push({
    pathname: '/home/detected',
    params: {
      id: w.id,
      type: String(w.type),
      title: w.title ?? '',
      start: String(w.startMs),
      end: String(w.endMs),
      source: w.source ?? '',
      dist: dist != null ? String(Math.round(dist)) : '',
      unnamed: needsName(w) ? '1' : '',
    },
  });
}

/** The honest line for every state that has no list to show. */
export function DetectedStateNote({ state }: { state: DetectedState }) {
  const router = useRouter();
  switch (state.status) {
    case 'unavailable':
      return (
        <Note>{HEALTH_UNAVAILABLE} Workouts from a watch can&apos;t be picked up without it.</Note>
      );
    case 'not_connected':
      return (
        <MenuRow
          icon="◐"
          name={`Connect ${HEALTH_APP}`}
          sub="To see walks, runs and workouts your watch picks up on its own"
          onPress={() => router.push('/settings/health')}
        />
      );
    case 'no_exercise_access':
      return (
        <MenuRow
          icon="◐"
          name="Allow exercise access"
          sub={`${HEALTH_APP} is connected, but 128BIT FIT isn't allowed to read exercise, so it can't see your watch's workouts`}
          onPress={() => router.push('/settings/health')}
        />
      );
    case 'error':
      return <Note>Couldn&apos;t read workouts from {HEALTH_APP}. {state.message}</Note>;
    default:
      return null;
  }
}

/**
 * Workouts a watch or another app recorded — an auto-detected walk, a class —
 * at the bottom of Home, so nothing done goes uncounted. Tap one for its
 * heart rate and calories, or to add it to your cardio. "See all" lists every
 * one from the last 30 days, including the ones held back and why.
 */
/**
 * The last list Home showed, so coming back to Home draws it at once instead
 * of an empty gap while Health Connect answers. Replaced by the fresh read.
 */
let lastShown: DetectedState | null = null;

export function DetectedWorkouts() {
  const router = useRouter();
  const [state, setState] = useState<DetectedState | null>(lastShown);

  const load = useCallback(() => {
    let live = true;
    const show = (next: DetectedState) => {
      lastShown = next;
      if (live) setState(next);
    };
    void (async () => {
      try {
        // The list first; heart rate and calories fill in after, so the
        // section never waits on fifteen Health Connect reads.
        const next = await getDetectedWorkouts({ days: 7 });
        if (next.status !== 'ready') return show(next);
        const top = next.workouts.slice(0, ON_HOME);
        const known = new Map(
          lastShown?.status === 'ready' ? lastShown.workouts.map((w) => [w.id, w.readings] as const) : []
        );
        const withKnown = (w: DetectedWorkout) => ({ ...w, readings: known.get(w.id) ?? null });
        show({ ...next, workouts: next.workouts.map(withKnown) });
        const readings = await readDetectedReadings(top);
        show({ ...next, workouts: next.workouts.map((w) => ({ ...w, readings: readings.get(w.id) ?? known.get(w.id) ?? null })) });
      } catch (e) {
        show({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    })();
    return () => {
      live = false;
    };
  }, []);
  useFocusEffect(load);
  useHealthRefresh(load);

  if (!state) return null;

  return (
    <>
      <Label>DETECTED WORKOUTS</Label>
      {state.status !== 'ready' ? (
        <DetectedStateNote state={state} />
      ) : (
        <>
          {state.workouts.length === 0 ? (
            <Note>Nothing from your watch or other apps in the last 7 days that you haven&apos;t already logged here.</Note>
          ) : (
            state.workouts.slice(0, ON_HOME).map((w) => {
              const r = w.readings;
              const value =
                r?.activeCalories != null
                  ? `${r.activeCalories} kcal`
                  : r?.heartRateAvg != null
                    ? `${r.heartRateAvg} bpm`
                    : undefined;
              return (
                <MenuRow
                  key={w.id}
                  icon="◉"
                  name={workoutTypeName(w.type, w.title)}
                  sub={detectedSub(w, sourceName(w.source))}
                  value={value}
                  onPress={() => openDetected(router, w)}
                />
              );
            })
          )}
          <MenuRow
            icon="≡"
            name="See all detected workouts"
            sub={
              state.workouts.length > ON_HOME || state.hidden.length > 0
                ? [
                    state.workouts.length > ON_HOME ? `${state.workouts.length - ON_HOME} more this week` : null,
                    state.hidden.length > 0 ? `${state.hidden.length} held back` : null,
                    'last 30 days',
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : 'Last 30 days, and any held back'
            }
            onPress={() => router.push('/home/detected-all')}
          />
        </>
      )}
    </>
  );
}
