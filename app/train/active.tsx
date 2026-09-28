import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
  type SessionExerciseWithMeta,
} from '@/db/workout-queries';
import type { WorkoutSet } from '@/db/schema';
import { getAppSettings, type WeightUnit } from '@/db/settings-queries';
import { exerciseImageSource } from '@/lib/exercise-images';
import { isUserExercise } from '@/lib/exercise-sources';
import { equipmentGroup } from '@/lib/equipment-groups';
import { plateHint } from '@/lib/plates';
import { afterSupersetTick, supersetLabels } from '@/lib/superset';
import { DEFAULT_REST_SECONDS, useRestTimer } from '@/lib/rest-timer';
import { shouldKeepAwake } from '@/lib/session-awake';
import { useSessionAwake } from '@/lib/use-session-awake';
import { describeLastPerformance } from '@/lib/set-prefill';
import { colors, fonts, spacing, themedStyles } from '@/lib/theme';
import { formatElapsed, sessionStats } from '@/lib/session-stats';

type SetPatch = Partial<Pick<WorkoutSet, 'reps' | 'weight' | 'weightUnit' | 'completed'>>;

export default function ActiveWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const timer = useRestTimer();
  const [workout, setWorkout] = useState<ActiveWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
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

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const onMarkComplete = async (
    se: SessionExerciseWithMeta,
    set: WorkoutSet,
    values: { reps: number | null; weight: number | null }
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
  const elapsedMs = workout.session.startedAt ? now - workout.session.startedAt.getTime() : 0;

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
            <Text style={styles.statV}>{formatElapsed(elapsedMs)}</Text>
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
                onComplete={(set, values) => void onMarkComplete(se, set, values)}
                onUncomplete={(set) => {
                  setPrSets((prev) => {
                    const next = new Set(prev);
                    next.delete(set.id);
                    return next;
                  });
                  void act(() => updateSet(set.id, { completed: false }));
                }}
                prSets={prSets}
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

function ExerciseCard({
  se,
  index,
  total,
  units,
  isCurrent,
  onSetCurrent,
  onHow,
  onAddPhoto,
  onMove,
  onPlates,
  supersetLabel,
  onSwap,
  onOptions,
  onSaveNote,
  onAddSet,
  onAddWarmupSet,
  onAddDropSet,
  onAddRestPause,
  onRemoveLastSet,
  onComplete,
  onUncomplete,
  onSave,
  prSets,
}: {
  prSets: ReadonlySet<string>;
  se: SessionExerciseWithMeta;
  index: number;
  total: number;
  units: WeightUnit;
  isCurrent: boolean;
  onSetCurrent: () => void;
  onHow: () => void;
  /** Your own exercise with no picture: open it to take or pick one. */
  onAddPhoto: () => void;
  onMove: (by: -1 | 1) => void;
  onPlates: (weight: number) => void;
  /** "A1", "A2"… when this exercise is in a superset. */
  supersetLabel: string | null;
  onSwap: () => void;
  onOptions: () => void;
  onSaveNote: (note: string) => void;
  onAddSet: () => void;
  onAddWarmupSet: () => void;
  onAddDropSet: () => void;
  onAddRestPause: () => void;
  onRemoveLastSet: () => void;
  onComplete: (set: WorkoutSet, values: { reps: number | null; weight: number | null }) => void;
  onUncomplete: (set: WorkoutSet) => void;
  onSave: (setId: string, patch: SetPatch) => void;
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(se.notes ?? '');
  const [imageFailed, setImageFailed] = useState(false);
  const completedSets = se.sets.filter((s) => s.completed).length;
  const totalSets = se.sets.length;
  const allDone = completedSets === totalSets && totalSets > 0;
  const stateChip = allDone ? 'DONE' : isCurrent ? 'CURRENT' : `${completedSets}/${totalSets}`;
  const lastLine = describeLastPerformance(se.lastPerformance);
  const lastDate = se.lastPerformance?.performedAt
    ? new Date(se.lastPerformance.performedAt).toLocaleDateString([], { day: 'numeric', month: 'short' })
    : null;
  const primaryMuscle = se.primaryMuscles?.[0] ?? '';
  const initials = se.exerciseName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const imageSource = imageFailed ? null : exerciseImageSource(se.image);
  // One you made, with no picture yet: offer to add one rather than show a
  // grey tile with its initials.
  const canAddPhoto = !imageSource && isUserExercise(se.category);
  // Barbell lifts: what to load for the next set still to do. One line,
  // read-only, so logging a set is exactly as fast as before.
  const nextSet = se.sets.find((st) => !st.completed);
  const plateWeight = nextSet?.weight ?? null;
  const plateLine =
    equipmentGroup(se.equipment) === 'barbell' && nextSet ? plateHint(plateWeight, units) : null;
  const caption = [primaryMuscle.toUpperCase(), se.equipment?.toUpperCase()].filter(Boolean).join(' · ');

  return (
    <View style={[styles.card, isCurrent && styles.cardCurrent]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardCounter}>
          EXERCISE {index + 1} / {total}
        </Text>
        {/* Re-order when the machine you wanted is taken. */}
        <View style={styles.moveRow}>
          <Pressable
            style={[styles.moveBtn, index === 0 && styles.moveBtnOff]}
            onPress={() => onMove(-1)}
            disabled={index === 0}
            hitSlop={6}
            accessibilityLabel="Move exercise up"
          >
            <Text style={styles.moveBtnText}>↑</Text>
          </Pressable>
          <Pressable
            style={[styles.moveBtn, index === total - 1 && styles.moveBtnOff]}
            onPress={() => onMove(1)}
            disabled={index === total - 1}
            hitSlop={6}
            accessibilityLabel="Move exercise down"
          >
            <Text style={styles.moveBtnText}>↓</Text>
          </Pressable>
        </View>
        <Text style={[styles.stateChip, (isCurrent || allDone) && styles.stateChipCurrent]}>{stateChip}</Text>
      </View>

      <View style={styles.exTile}>
        <View style={styles.exThumb}>
          {imageSource ? (
            <Image source={imageSource} style={styles.exThumbImg} resizeMode="cover" onError={() => setImageFailed(true)} />
          ) : (
            <Text style={styles.exThumbText}>{initials}</Text>
          )}
        </View>
        <Text style={styles.exName}>{se.exerciseName}</Text>
      </View>

      <View style={styles.chipRow}>
        {supersetLabel ? <Text style={[styles.chip, styles.supersetChip]}>SUPERSET {supersetLabel}</Text> : null}
        {primaryMuscle ? <Text style={styles.chip}>{primaryMuscle.toUpperCase()}</Text> : null}
        {se.equipment ? <Text style={styles.chip}>{se.equipment.toUpperCase()}</Text> : null}
        {se.best ? (
          <Text style={styles.chip}>
            Best {se.best.weight} {se.best.unit}
          </Text>
        ) : null}
      </View>

      <View style={styles.buttonRow}>
        <Pressable style={styles.outlineBtn} onPress={onSwap}>
          <Text style={styles.outlineBtnText}>⇄ Swap</Text>
        </Pressable>
        <Pressable style={styles.outlineBtn} onPress={onHow}>
          <Text style={styles.outlineBtnText}>? How</Text>
        </Pressable>
        <Pressable style={styles.outlineBtn} onPress={onOptions}>
          <Text style={styles.outlineBtnText}>⚙ Options</Text>
        </Pressable>
        {isCurrent ? (
          <View style={styles.accentBtn}>
            <Text style={styles.accentBtnText}>● Current</Text>
          </View>
        ) : (
          <Pressable style={styles.outlineBtn} onPress={onSetCurrent}>
            <Text style={styles.outlineBtnText}>Set current</Text>
          </Pressable>
        )}
      </View>

      {/* The library's own picture of the movement, on the exercise in hand. */}
      {isCurrent ? (
        <Pressable style={styles.photoPanel} onPress={canAddPhoto ? onAddPhoto : onHow}>
          {imageSource ? (
            <Image
              source={imageSource}
              style={styles.photoImage}
              resizeMode="contain"
              onError={() => setImageFailed(true)}
            />
          ) : canAddPhoto ? (
            <View style={[styles.photoPlaceholder, styles.photoAdd]}>
              <Text style={styles.photoAddIcon}>＋</Text>
            </View>
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoInitials}>{initials}</Text>
            </View>
          )}
          {caption ? <Text style={styles.photoCaption}>{caption}</Text> : null}
          <Text style={styles.photoHint}>
            {canAddPhoto ? 'Add a photo of this machine — camera or gallery' : 'Tap for how to do it'}
          </Text>
        </Pressable>
      ) : null}

      <Text style={styles.lastLine}>
        {lastLine ? `Last time${lastDate ? ` (${lastDate})` : ''}: ${lastLine}` : 'First time — no previous sets'}
      </Text>

      {se.notes && !noteOpen ? (
        <Pressable onPress={() => setNoteOpen(true)}>
          <Text style={styles.noteText}>✎ {se.notes}</Text>
        </Pressable>
      ) : null}
      {noteOpen ? (
        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder="Seat height 4, pause at the bottom…"
          placeholderTextColor={colors.textDim}
          autoFocus
          multiline
          onBlur={() => {
            setNoteOpen(false);
            if (note.trim() !== (se.notes ?? '')) onSaveNote(note);
          }}
        />
      ) : null}

      <View style={styles.setHeader}>
        {/* Same columns as the rows below, and shrink-to-fit so a large
            system font cannot run SET into WEIGHT. */}
        <Text style={[styles.col, styles.colSet, styles.headText]} numberOfLines={1} adjustsFontSizeToFit>
          SET
        </Text>
        <Text style={[styles.col, styles.colNum, styles.headText]} numberOfLines={1} adjustsFontSizeToFit>
          WEIGHT ({units.toUpperCase()})
        </Text>
        <Text style={[styles.col, styles.colNum, styles.headText]} numberOfLines={1} adjustsFontSizeToFit>
          REPS
        </Text>
        <View style={styles.colDone} />
      </View>

      {se.sets.map((set, setIdx) => {
        const workingBefore = se.sets
          .slice(0, setIdx)
          .filter((s) => !s.isWarmup && s.setType === 'normal').length;
        const label = set.isWarmup
          ? 'W'
          : set.setType === 'drop'
            ? 'D'
            : set.setType === 'rp'
              ? 'RP'
              : String(workingBefore + 1);
        return (
          <SetRow
            key={set.id}
            set={set}
            label={label}
            step={units === 'kg' ? 2.5 : 5}
            units={units}
            onComplete={(values) => onComplete(set, values)}
            onUncomplete={() => onUncomplete(set)}
            onSave={onSave}
            isPr={prSets.has(set.id)}
          />
        );
      })}

      {plateLine ? (
        <Pressable onPress={() => onPlates(plateWeight!)} hitSlop={6} style={styles.plateHint}>
          <Text style={styles.plateHintText}>{plateLine} ›</Text>
        </Pressable>
      ) : null}

      <View style={styles.actionGrid}>
        <Pressable style={styles.dashedBtn} onPress={() => setNoteOpen(true)}>
          <Text style={styles.dashedBtnText}>{se.notes ? '✎ Edit note' : '+ Note'}</Text>
        </Pressable>
        <Pressable style={styles.dashedBtn} onPress={onAddWarmupSet}>
          <Text style={styles.dashedBtnText}>+ Warm-up set</Text>
        </Pressable>
        <Pressable style={styles.dashedBtn} onPress={onAddSet}>
          <Text style={styles.dashedBtnText}>+ Add set</Text>
        </Pressable>
        <Pressable style={styles.dashedBtn} onPress={onAddDropSet}>
          <Text style={styles.dashedBtnText}>+ Drop set</Text>
        </Pressable>
        <Pressable style={styles.dashedBtn} onPress={onAddRestPause}>
          <Text style={styles.dashedBtnText}>+ Rest-pause</Text>
        </Pressable>
        <Pressable
          style={[styles.dashedBtn, totalSets === 0 && { opacity: 0.4 }]}
          onPress={onRemoveLastSet}
          disabled={totalSets === 0}
        >
          <Text style={styles.dashedBtnText}>− Remove set</Text>
        </Pressable>
      </View>
    </View>
  );
}

function parseNum(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const show = (n: number | null | undefined) => (n == null ? '' : String(n));

function SetRow({
  set,
  label,
  step,
  units,
  onComplete,
  onUncomplete,
  onSave,
  isPr,
}: {
  isPr: boolean;
  set: WorkoutSet;
  label: string;
  step: number;
  units: WeightUnit;
  onComplete: (values: { reps: number | null; weight: number | null }) => void;
  onUncomplete: () => void;
  onSave: (setId: string, patch: SetPatch) => void;
}) {
  const [weight, setWeight] = useState(show(set.weight));
  const [reps, setReps] = useState(show(set.reps));

  // A reload that changes the stored numbers (a swap re-seeds them) must show
  // through; typing does not trigger it because it only fires on a new value.
  useEffect(() => setWeight(show(set.weight)), [set.weight]);
  useEffect(() => setReps(show(set.reps)), [set.reps]);

  const saveWeight = (next: number | null) => {
    setWeight(show(next));
    onSave(set.id, { weight: next, weightUnit: units });
  };
  const saveReps = (next: number | null) => {
    setReps(show(next));
    onSave(set.id, { reps: next });
  };
  const round = (n: number) => Math.round(n * 100) / 100;

  return (
    <View style={[styles.setRow, set.isWarmup && styles.warmupRow, set.completed && styles.doneRow]}>
      <Text style={[styles.col, styles.colSet, styles.setLabel, set.isWarmup && styles.warmText]} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
      <View style={[styles.col, styles.colNum, styles.numGroup]}>
        <Pressable
          style={styles.stepBtn}
          hitSlop={4}
          onPress={() => {
            const n = parseNum(weight);
            if (n != null) saveWeight(round(Math.max(0, n - step)));
          }}
        >
          <Text style={styles.stepperBtn}>−</Text>
        </Pressable>
        <TextInput
          style={styles.numInput}
          value={weight}
          onChangeText={setWeight}
          onEndEditing={() => saveWeight(parseNum(weight))}
          keyboardType="decimal-pad"
          placeholder="–"
          placeholderTextColor={colors.textDim}
          selectTextOnFocus
        />
        <Pressable
          style={styles.stepBtn}
          hitSlop={4}
          onPress={() => saveWeight(round((parseNum(weight) ?? 0) + step))}
        >
          <Text style={styles.stepperBtn}>+</Text>
        </Pressable>
      </View>
      <View style={[styles.col, styles.colNum, styles.numGroup]}>
        <Pressable
          style={styles.stepBtn}
          hitSlop={4}
          onPress={() => {
            const n = parseNum(reps);
            if (n != null) saveReps(Math.max(0, n - 1));
          }}
        >
          <Text style={styles.stepperBtn}>−</Text>
        </Pressable>
        <TextInput
          style={styles.numInput}
          value={reps}
          onChangeText={setReps}
          onEndEditing={() => saveReps(parseNum(reps))}
          keyboardType="number-pad"
          placeholder="–"
          placeholderTextColor={colors.textDim}
          selectTextOnFocus
        />
        <Pressable style={styles.stepBtn} hitSlop={4} onPress={() => saveReps((parseNum(reps) ?? 0) + 1)}>
          <Text style={styles.stepperBtn}>+</Text>
        </Pressable>
      </View>
      <Pressable
        style={[styles.tickCircle, set.completed && styles.tickOn]}
        hitSlop={6}
        accessibilityLabel={set.completed ? 'Un-tick set' : 'Log set'}
        onPress={() =>
          set.completed ? onUncomplete() : onComplete({ weight: parseNum(weight), reps: parseNum(reps) })
        }
      >
        <Text style={[styles.tickText, set.completed && styles.tickTextOn]}>✓</Text>
        {isPr && set.completed ? (
          <View style={styles.prBadge} pointerEvents="none">
            <PixelTrophy size={16} />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  muted: {
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  secondaryBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.textDim,
    borderRadius: 6,
  },
  secondaryBtnText: {
    color: colors.text,
    fontWeight: '600',
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stat: {
    alignItems: 'center',
  },
  statV: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  statL: {
    fontSize: 11,
    color: colors.textDim,
    marginTop: 4,
    letterSpacing: 0.5,
  },
  empty: {
    color: colors.textDim,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardCurrent: {
    borderColor: colors.accent,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardCounter: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textDim,
    letterSpacing: 0.5,
  },
  moveRow: { flexDirection: 'row', gap: 8, marginRight: 10 },
  plateHint: { paddingVertical: 8 },
  supersetChip: { borderWidth: 1, borderColor: colors.accent, color: colors.accent },
  plateHintText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  moveBtn: {
    width: 36,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveBtnOff: { opacity: 0.3 },
  moveBtnText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  stateChip: {
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: colors.textDim,
    color: colors.bg,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
  },
  stateChipCurrent: {
    backgroundColor: colors.accent,
    color: colors.onAccent,
  },
  exTile: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  exThumb: {
    width: 44,
    height: 44,
    backgroundColor: colors.textDim,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
    overflow: 'hidden',
  },
  exThumbImg: { width: '100%', height: '100%', backgroundColor: '#ffffff' },
  exThumbText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.bg,
  },
  exName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    flexWrap: 'wrap',
  },
  chip: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    backgroundColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    flexWrap: 'wrap',
  },
  outlineBtn: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    alignItems: 'center',
  },
  outlineBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  accentBtn: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: 6,
    alignItems: 'center',
  },
  accentBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.onAccent,
  },
  photoPanel: {
    backgroundColor: colors.border,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  photoPlaceholder: {
    width: 100,
    height: 100,
    backgroundColor: colors.bg,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  photoAdd: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.accent },
  photoAddIcon: { fontSize: 36, color: colors.accent, fontWeight: '300' },
  photoInitials: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textDim,
  },
  photoHint: {
    fontSize: 12,
    color: colors.textDim,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  photoCaption: {
    fontSize: 12,
    color: colors.textDim,
  },
  photoImage: {
    width: '100%',
    height: 160,
    marginBottom: spacing.sm,
    backgroundColor: '#ffffff',
    borderRadius: 6,
  },
  noteText: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  noteInput: {
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: spacing.sm,
    marginBottom: spacing.md,
    minHeight: 44,
  },
  lastLine: {
    fontSize: 13,
    color: colors.textDim,
    marginBottom: spacing.md,
  },
  setHeader: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.xs,
  },
  col: {
    flex: 1,
  },
  colSet: {
    width: 30,
    flex: 0,
  },
  colNum: {
    flex: 1,
  },
  colDone: {
    width: 36,
    flex: 0,
  },
  // The set number was unstyled, so it drew near-black on the dark card.
  setLabel: { color: colors.textMuted, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  headText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  warmupRow: {
    backgroundColor: colors.border,
  },
  warmText: {
    color: colors.textDim,
  },
  doneRow: {
    opacity: 0.75,
  },
  numGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  stepBtn: {
    width: 34,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtn: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.accent,
  },
  numInput: {
    flex: 1,
    minWidth: 40,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    backgroundColor: colors.bg,
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: spacing.xs,
  },
  tickCircle: {
    overflow: 'visible',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.borderBright,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  prBadge: { position: 'absolute', top: -8, right: -8 },
  prBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  prBannerHead: { color: colors.text, fontFamily: fonts.pixel, fontSize: 9, letterSpacing: 1 },
  prBannerNote: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  tickOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  tickText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textDim,
  },
  tickTextOn: {
    color: colors.onAccent,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    flexWrap: 'wrap',
  },
  dashedBtn: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: 6,
    alignItems: 'center',
  },
  dashedBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  footer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  addBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: 6,
    alignItems: 'center',
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.onAccent,
  },
  discardLink: {
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  discardLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textDim,
  },
}));
