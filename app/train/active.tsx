import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { RestTimerBar } from '@/components/RestTimerBar';
import {
  addSet,
  completeSession,
  completeSet,
  discardSession,
  loadActiveWorkout,
  updateSet,
  type ActiveWorkout,
  type SessionExerciseWithMeta,
} from '@/db/workout-queries';
import type { WorkoutSet, SetType } from '@/db/schema';
import { getAppSettings } from '@/db/settings-queries';
import { DEFAULT_REST_SECONDS, useRestTimer } from '@/lib/rest-timer';
import { shouldKeepAwake } from '@/lib/session-awake';
import { useSessionAwake } from '@/lib/use-session-awake';
import { describeLastPerformance } from '@/lib/set-prefill';
import { colors, spacing, themedStyles } from '@/lib/theme';
import { formatElapsed, sessionStats } from '@/lib/session-stats';

export default function ActiveWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const timer = useRestTimer();
  const [workout, setWorkout] = useState<ActiveWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [keepAwake, setKeepAwake] = useState(false);
  const [currentExerciseId, setCurrentExerciseId] = useState<string | null>(null);

  const sessionId = id ? decodeURIComponent(id) : '';

  useSessionAwake(shouldKeepAwake(keepAwake, workout?.session.status));

  const refresh = useCallback(async () => {
    const w = await loadActiveWorkout(sessionId);
    setWorkout(w);
    if (w && currentExerciseId === null) {
      const first = w.exercises.find(ex => !ex.sets.every(s => s.completed));
      setCurrentExerciseId(first?.id ?? w.exercises[0]?.id ?? null);
    }
  }, [sessionId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      refresh().finally(() => setLoading(false));
      const interval = setInterval(() => {
        if (workout?.session.startedAt) {
          setElapsedMs(Date.now() - workout.session.startedAt.getTime());
        }
      }, 1000);
      return () => clearInterval(interval);
    }, [refresh, workout?.session.startedAt])
  );

  const onAddSet = async (se: SessionExerciseWithMeta) => {
    await addSet(se.id);
    await refresh();
  };

  const onMarkComplete = async (
    se: SessionExerciseWithMeta,
    set: WorkoutSet,
    values?: { reps?: number | null; weight?: number | null }
  ) => {
    await completeSet(set.id, {
      reps: values?.reps !== undefined ? values.reps : set.reps,
      weight: values?.weight !== undefined ? values.weight : set.weight,
    });
    const rest = se.restSeconds ?? DEFAULT_REST_SECONDS;
    timer.start(rest, se.id, sessionId);
    await refresh();
  };

  const patchSet = async (
    setId: string,
    patch: Partial<Pick<WorkoutSet, 'reps' | 'weight' | 'completed' | 'setType'>>
  ) => {
    await updateSet(setId, patch);
    await refresh();
  };

  const onFinish = () => {
    Alert.alert('Finish workout?', 'Mark this session as completed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Finish',
        onPress: async () => {
          timer.skip();
          await completeSession(sessionId);
          router.replace(`/train/summary?id=${encodeURIComponent(sessionId)}`);
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

  if (loading) {
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

  const allSets = workout.exercises.flatMap(ex => ex.sets);
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
            <Text style={styles.statL}>LB VOLUME</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statV}>{formatElapsed(elapsedMs)}</Text>
            <Text style={styles.statL}>ELAPSED</Text>
          </View>
        </View>
        <RestTimerBar />
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
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
                isCurrent={se.id === currentExerciseId}
                onSetCurrent={() => setCurrentExerciseId(se.id)}
                onAddSet={() => onAddSet(se)}
                onAddWarmupSet={async () => {
                  await addSet(se.id, { isWarmup: true });
                  await refresh();
                }}
                onAddDropSet={async () => {
                  await addSet(se.id, { setType: 'drop' });
                  await refresh();
                }}
                onAddRestPause={async () => {
                  await addSet(se.id, { setType: 'rp' });
                  await refresh();
                }}
                onRemoveSet={async (setId: string) => {
                  Alert.alert('Remove set?', 'This set will be deleted.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: async () => {
                        // TODO: implement set deletion
                        await refresh();
                      },
                    },
                  ]);
                }}
                onComplete={(set, values) => onMarkComplete(se, set, values)}
                onPatch={patchSet}
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
  isCurrent,
  onSetCurrent,
  onAddSet,
  onAddWarmupSet,
  onAddDropSet,
  onAddRestPause,
  onRemoveSet,
  onComplete,
  onPatch,
}: {
  se: SessionExerciseWithMeta;
  index: number;
  total: number;
  isCurrent: boolean;
  onSetCurrent: () => void;
  onAddSet: () => void;
  onAddWarmupSet: () => void;
  onAddDropSet: () => void;
  onAddRestPause: () => void;
  onRemoveSet: (setId: string) => void;
  onComplete: (
    set: WorkoutSet,
    values?: { reps?: number | null; weight?: number | null }
  ) => void;
  onPatch: (
    setId: string,
    patch: Partial<Pick<WorkoutSet, 'reps' | 'weight' | 'completed' | 'setType'>>
  ) => void;
}) {
  const completedSets = se.sets.filter(s => s.completed).length;
  const totalSets = se.sets.length;
  const allDone = completedSets === totalSets && totalSets > 0;
  const stateChip = allDone ? 'DONE' : isCurrent ? 'CURRENT' : `${completedSets}/${totalSets}`;
  const lastLine = describeLastPerformance(se.lastPerformance);
  const primaryMuscle = se.primaryMuscles?.[0] ?? '';
  const initials = se.exerciseName
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  return (
    <View style={[styles.card, isCurrent && styles.cardCurrent]}>
      {/* Header with counter and state chip */}
      <View style={styles.cardHeader}>
        <Text style={styles.cardCounter}>EXERCISE {index + 1} / {total}</Text>
        <Text style={[styles.stateChip, isCurrent && styles.stateChipCurrent]}>
          {stateChip}
        </Text>
      </View>

      {/* Exercise tile: thumbnail + name */}
      <View style={styles.exTile}>
        <View style={styles.exThumb}>
          <Text style={styles.exThumbText}>{initials}</Text>
        </View>
        <Text style={styles.exName}>{se.exerciseName}</Text>
      </View>

      {/* Chips: muscle, equipment, best */}
      <View style={styles.chipRow}>
        {primaryMuscle && <Text style={styles.chip}>{primaryMuscle.toUpperCase()}</Text>}
        {se.equipment && <Text style={styles.chip}>{se.equipment.toUpperCase()}</Text>}
        {se.bestWeight !== null && <Text style={styles.chip}>Best {se.bestWeight} lb</Text>}
      </View>

      {/* Buttons: Swap, How, Options, Set current */}
      <View style={styles.buttonRow}>
        <Pressable style={styles.outlineBtn}>
          <Text style={styles.outlineBtnText}>⇄ Swap</Text>
        </Pressable>
        <Pressable style={styles.outlineBtn}>
          <Text style={styles.outlineBtnText}>? How</Text>
        </Pressable>
        <Pressable style={styles.outlineBtn}>
          <Text style={styles.outlineBtnText}>⚙ Options</Text>
        </Pressable>
        {isCurrent ? (
          <Pressable style={styles.accentBtn}>
            <Text style={styles.accentBtnText}>● Current</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.outlineBtn} onPress={onSetCurrent}>
            <Text style={styles.outlineBtnText}>Set current</Text>
          </Pressable>
        )}
      </View>

      {/* Reference photo panel - only on current card */}
      {isCurrent && (
        <View style={styles.photoPanel}>
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoInitials}>{initials}</Text>
            <Text style={styles.photoHint}>Tap to add a reference photo</Text>
          </View>
          <Text style={styles.photoCaption}>
            {primaryMuscle.toUpperCase()} · {se.equipment?.toUpperCase() ?? 'N/A'}
          </Text>
        </View>
      )}

      {/* Last performance line */}
      {lastLine ? (
        <Text style={styles.lastLine}>Last time ({lastLine})</Text>
      ) : (
        <Text style={styles.lastLine}>First time — no previous sets</Text>
      )}

      {/* Set table header */}
      <View style={styles.setHeader}>
        <Text style={[styles.col, styles.colSet]}>SET</Text>
        <Text style={[styles.col, styles.colNum]}>WEIGHT (LB)</Text>
        <Text style={[styles.col, styles.colNum]}>REPS</Text>
        <Text style={[styles.col, styles.colDone]}></Text>
      </View>

      {/* Set rows */}
      {se.sets.map((set, setIdx) => {
        const isWarmup = set.isWarmup;
        const workingSetsBeforeThis = se.sets
          .slice(0, setIdx)
          .filter(s => !s.isWarmup && s.setType === 'normal').length;
        const setNum = isWarmup ? 'W' : (workingSetsBeforeThis + 1).toString();

        return (
          <SetRow
            key={set.id}
            set={set}
            setNum={setNum}
            isWarmup={isWarmup}
            setType={set.setType as SetType}
            onComplete={(values) => onComplete(set, values)}
            onPatch={onPatch}
          />
        );
      })}

      {/* Action buttons */}
      <View style={styles.actionGrid}>
        <Pressable style={styles.dashedBtn}>
          <Text style={styles.dashedBtnText}>+ Note</Text>
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
        <Pressable style={styles.dashedBtn}>
          <Text style={styles.dashedBtnText}>− Remove set</Text>
        </Pressable>
      </View>
    </View>
  );
}

function parseNum(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

function SetRow({
  set,
  setNum,
  isWarmup,
  setType,
  onComplete,
  onPatch,
}: {
  set: WorkoutSet;
  setNum: string;
  isWarmup: boolean;
  setType: SetType;
  onComplete: (values: { reps?: number | null; weight?: number | null }) => void;
  onPatch: (
    setId: string,
    patch: Partial<Pick<WorkoutSet, 'reps' | 'weight' | 'completed' | 'setType'>>
  ) => void;
}) {
  const [weight, setWeight] = useState(set.weight?.toString() ?? '');
  const [reps, setReps] = useState(set.reps?.toString() ?? '');

  const displayNum =
    setType === 'drop' ? 'D' : setType === 'rp' ? 'RP' : setNum;

  return (
    <View style={[styles.setRow, isWarmup && styles.warmupRow]}>
      <Text style={[styles.col, styles.colSet, isWarmup && styles.warmText]}>
        {displayNum}
      </Text>
      <View style={[styles.col, styles.colNum, styles.numGroup]}>
        <Pressable onPress={() => setWeight(prev => parseNum(prev) ? String(Math.max(0, parseNum(prev)! - 5)) : prev)}>
          <Text style={styles.stepperBtn}>−</Text>
        </Pressable>
        <TextInput
          style={styles.numInput}
          value={weight}
          onChangeText={setWeight}
          keyboardType="number-pad"
          placeholder="0"
        />
        <Pressable onPress={() => setWeight(prev => parseNum(prev) ? String(parseNum(prev)! + 5) : '5')}>
          <Text style={styles.stepperBtn}>+</Text>
        </Pressable>
      </View>
      <View style={[styles.col, styles.colNum, styles.numGroup]}>
        <Pressable onPress={() => setReps(prev => parseNum(prev) ? String(Math.max(0, parseNum(prev)! - 1)) : prev)}>
          <Text style={styles.stepperBtn}>−</Text>
        </Pressable>
        <TextInput
          style={styles.numInput}
          value={reps}
          onChangeText={setReps}
          keyboardType="number-pad"
          placeholder="0"
        />
        <Pressable onPress={() => setReps(prev => parseNum(prev) ? String(parseNum(prev)! + 1) : '1')}>
          <Text style={styles.stepperBtn}>+</Text>
        </Pressable>
      </View>
      <Pressable
        style={styles.tickCircle}
        onPress={() => {
          onComplete({
            weight: parseNum(weight),
            reps: parseNum(reps),
          });
        }}
      >
        <Text style={styles.tickText}>{set.completed ? '✓' : '○'}</Text>
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
    borderRadius: 8,
  },
  cardCurrent: {
    borderWidth: 2,
    borderColor: colors.accent,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardCounter: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textDim,
    letterSpacing: 0.5,
  },
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
  },
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
    width: 30,
    flex: 0,
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
  numGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  stepperBtn: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.accent,
    paddingHorizontal: spacing.xs,
  },
  numInput: {
    width: 50,
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
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.accent,
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
