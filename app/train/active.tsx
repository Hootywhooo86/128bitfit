import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from 'expo-router';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { PixelTrophy } from '@/components/PixelTrophy';
import { RestTimerBar } from '@/components/RestTimerBar';
import {
  addSet,
  completeSession,
  completeSet,
  deleteSet,
  discardSession,
  liveRecordFor,
  loadActiveWorkout,
  moveSessionExercise,
  toggleSupersetWithNext,
  removeSessionExercise,
  setSessionExerciseNote,
  updateSet,
  type ActiveWorkout,
  setSessionExerciseTrack,
  type SessionExerciseWithMeta,
} from '@/db/workout-queries';
import type { WorkoutSet } from '@/db/schema';
import { getAppSettings, type WeightUnit } from '@/db/settings-queries';
import { afterSupersetTick, supersetLabels } from '@/lib/superset';
import { DEFAULT_REST_SECONDS, useRestTimer } from '@/lib/rest-timer';
import { shouldKeepAwake } from '@/lib/session-awake';
import { useSessionAwake } from '@/lib/use-session-awake';
import { colors } from '@/lib/theme';
import { sessionStats } from '@/lib/session-stats';
import type { SetValues } from '@/components/workout/types';
import { activeWorkoutStyles as styles } from '@/components/workout/active-styles';
import { Elapsed } from '@/components/workout/Elapsed';
import { ExerciseCard } from '@/components/workout/ExerciseCard';

/** A crash here shows a screen with Try again, instead of closing the app. */
export { ErrorScreen as ErrorBoundary } from '@/components/ErrorScreen';

export default function ActiveWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const timer = useRestTimer();
  const [workout, setWorkout] = useState<ActiveWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [keepAwake, setKeepAwake] = useState(false);
  const [units, setUnits] = useState<WeightUnit>('lb');
  const [currentExerciseId, setCurrentExerciseId] = useState<string | null>(null);
  /** Sets ticked this visit that were records, for the trophy on the row. */
  const [prSets, setPrSets] = useState<ReadonlySet<string>>(new Set());
  const [prBanner, setPrBanner] = useState<{ name: string; note: string } | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
  }, []);

  const sessionId = id ? decodeURIComponent(id) : '';

  useSessionAwake(shouldKeepAwake(keepAwake, workout?.session.status));

  useEffect(() => {
    let alive = true;
    void getAppSettings()
      .then((settings) => {
        if (!alive) return;
        setKeepAwake(settings.keepAwake);
        setUnits(settings.units);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const w = await loadActiveWorkout(sessionId);
    setWorkout(w);
    if (!w) return;
    // Keep the user's choice of current exercise across reloads; only pick one
    // when there is none yet, or when the chosen one was removed or swapped out.
    setCurrentExerciseId((prev) => {
      if (prev && w.exercises.some((ex) => ex.id === prev)) return prev;
      const firstOpen = w.exercises.find((ex) => ex.sets.some((s) => !s.completed));
      return firstOpen?.id ?? w.exercises[0]?.id ?? null;
    });
  }, [sessionId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      refresh().finally(() => setLoading(false));
    }, [refresh])
  );


  const onMarkComplete = async (
    se: SessionExerciseWithMeta,
    set: WorkoutSet,
    values: SetValues
  ) => {
    await completeSet(set.id, values);
    if (values.weight != null) await updateSet(set.id, { weightUnit: units });
    // A superset rests only after its last exercise; before that, go
    // straight on to the partner.
    const next = workout ? afterSupersetTick(workout.exercises, se.id) : { rest: true, nextCurrentId: se.id };
    if (next.rest) {
      const rest = se.restSeconds ?? DEFAULT_REST_SECONDS;
      timer.start(rest, se.id, sessionId);
    }
    if (next.nextCurrentId !== se.id) setCurrentExerciseId(next.nextCurrentId);
    await refresh();
    // After the tick has saved and the rest has started, so it never costs
    // the three seconds. A failed check just means no trophy this time.
    void liveRecordFor(set.id)
      .then((pr) => {
        if (pr.kinds.length === 0 || !pr.note) return;
        setPrSets((prev) => new Set(prev).add(set.id));
        setPrBanner({ name: se.exerciseName, note: pr.note });
        if (bannerTimer.current) clearTimeout(bannerTimer.current);
        bannerTimer.current = setTimeout(() => setPrBanner(null), 5000);
      })
      .catch(() => undefined);
  };

  const supersetTags = supersetLabels(workout?.exercises ?? []);

  const onFinish = () => {
    Alert.alert('Finish workout?', 'Mark this session as completed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Finish',
        onPress: async () => {
          timer.skip();
          await completeSession(sessionId);
          router.replace(`/train/summary?id=${encodeURIComponent(sessionId)}&fresh=1`);
        },
      },
    ]);
  };

  const onDiscard = () => {
    Alert.alert('Discard workout?', 'Session will be marked discarded.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          timer.skip();
          await discardSession(sessionId);
          router.replace('/(tabs)/train');
        },
      },
    ]);
  };

  /** Runs a write, then reloads; a failure is said, not swallowed. */
  const act = async (work: () => Promise<unknown>) => {
    try {
      await work();
    } catch (e) {
      Alert.alert('That did not save', e instanceof Error ? e.message : String(e));
    }
    await refresh();
  };

  if (loading && !workout) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!workout || workout.session.status !== 'in_progress') {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>No active workout.</Text>
        <Pressable style={styles.secondaryBtn} onPress={() => router.replace('/(tabs)/train')}>
          <Text style={styles.secondaryBtnText}>Back to Train</Text>
        </Pressable>
      </View>
    );
  }

  const allSets = workout.exercises.flatMap((ex) => ex.sets);
  const stats = sessionStats(allSets);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Workout',
          headerRight: () => (
            <Pressable onPress={onFinish} hitSlop={8}>
              <Text style={{ color: colors.accent, fontWeight: '800' }}>Finish</Text>
            </Pressable>
          ),
        }}
      />
      <View style={styles.container}>
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statV}>
              {stats.setsDone}/{stats.setsTotal}
            </Text>
            <Text style={styles.statL}>SETS</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statV}>
              {stats.volume.toLocaleString()}
              {stats.volumePartial ? '+' : ''}
            </Text>
            <Text style={styles.statL}>{units.toUpperCase()} VOLUME</Text>
          </View>
          <View style={styles.stat}>
            <Elapsed since={workout.session.startedAt} style={styles.statV} />
            <Text style={styles.statL}>ELAPSED</Text>
          </View>
        </View>
        <RestTimerBar />
        {prBanner ? (
          <Pressable style={styles.prBanner} onPress={() => setPrBanner(null)}>
            <PixelTrophy size={32} />
            <View style={{ flex: 1 }}>
              <Text style={styles.prBannerHead}>NEW PR · {prBanner.name.toUpperCase()}</Text>
              <Text style={styles.prBannerNote}>{prBanner.note}</Text>
            </View>
          </Pressable>
        ) : null}
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
          {workout.exercises.length === 0 ? (
            <Text style={styles.empty}>
              No exercises yet. Add one from the library to start logging sets.
            </Text>
          ) : (
            workout.exercises.map((se, idx) => (
              <ExerciseCard
                key={se.id}
                se={se}
                index={idx}
                total={workout.exercises.length}
                units={units}
                isCurrent={se.id === currentExerciseId}
                onSetCurrent={() => setCurrentExerciseId(se.id)}
                onHow={() => router.push({ pathname: '/exercise/[id]', params: { id: se.exerciseId } })}
                onAddPhoto={() => router.push({ pathname: '/exercise/new', params: { id: se.exerciseId } })}
                onMove={(by) => void act(() => moveSessionExercise(se.id, by))}
                supersetLabel={supersetTags.get(se.id) ?? null}
                onPlates={(w) => router.push({ pathname: '/train/plates', params: { target: String(w) } })}
                onSwap={() =>
                  router.push({ pathname: '/train/add-exercise', params: { sessionId, swap: se.id } })
                }
                onOptions={() =>
                  Alert.alert(se.exerciseName, undefined, [
                    {
                      text: se.supersetGroup ? 'Remove from superset' : 'Superset with next',
                      onPress: () => void act(() => toggleSupersetWithNext(se.id)),
                    },
                    {
                      text: 'Remove from workout',
                      style: 'destructive',
                      onPress: () =>
                        Alert.alert(
                          'Remove this exercise?',
                          se.sets.some((s) => s.completed)
                            ? 'Its logged sets are deleted with it.'
                            : 'It has no logged sets.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            { text: 'Remove', style: 'destructive', onPress: () => void act(() => removeSessionExercise(se.id)) },
                          ]
                        ),
                    },
                    { text: 'Cancel', style: 'cancel' },
                  ])
                }
                onSaveNote={(note) => void act(() => setSessionExerciseNote(se.id, note))}
                onAddSet={() => void act(() => addSet(se.id))}
                onAddWarmupSet={() => void act(() => addSet(se.id, { isWarmup: true }))}
                onAddDropSet={() => void act(() => addSet(se.id, { setType: 'drop' }))}
                onAddRestPause={() => void act(() => addSet(se.id, { setType: 'rp' }))}
                onRemoveLastSet={() => {
                  const last = se.sets[se.sets.length - 1];
                  if (!last) return;
                  if (!last.completed) return void act(() => deleteSet(last.id));
                  Alert.alert('Remove the last set?', 'It is already logged — removing it deletes it.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => void act(() => deleteSet(last.id)) },
                  ]);
                }}
                onComplete={(set, values) =>
                  void onMarkComplete(se, set, values).catch((e) =>
                    // Rare — SQLite on the phone — but a tick that did not
                    // save must not look like one that did.
                    Alert.alert('That set did not save', e instanceof Error ? e.message : String(e))
                  )
                }
                onUncomplete={(set) => {
                  setPrSets((prev) => {
                    const next = new Set(prev);
                    next.delete(set.id);
                    return next;
                  });
                  void act(() => updateSet(set.id, { completed: false }));
                }}
                prSets={prSets}
                onTrack={(mode) => void act(() => setSessionExerciseTrack(se.id, mode))}
                onSave={(setId, patch) => {
                  // Written straight through without a reload, so stepping a
                  // weight never waits on the whole workout being re-read.
                  void updateSet(setId, patch).catch((e) =>
                    Alert.alert('That did not save', e instanceof Error ? e.message : String(e))
                  );
                }}
              />
            ))
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={styles.addBtn}
            onPress={() =>
              router.push(`/train/add-exercise?sessionId=${encodeURIComponent(sessionId)}`)
            }
          >
            <Text style={styles.addBtnText}>+ Add exercise</Text>
          </Pressable>
          <Pressable style={styles.discardLink} onPress={onDiscard}>
            <Text style={styles.discardLinkText}>Discard</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}
