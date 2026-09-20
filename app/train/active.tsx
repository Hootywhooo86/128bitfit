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
import type { WorkoutSet } from '@/db/schema';
import { DEFAULT_REST_SECONDS, useRestTimer } from '@/lib/rest-timer';
import { colors, spacing } from '@/lib/theme';

export default function ActiveWorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const timer = useRestTimer();
  const [workout, setWorkout] = useState<ActiveWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [elapsed, setElapsed] = useState('0:00');

  const sessionId = id ? decodeURIComponent(id) : '';

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    const data = await loadActiveWorkout(sessionId);
    setWorkout(data);
    setLoading(false);
  }, [sessionId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  useEffect(() => {
    if (!workout?.session.startedAt) return;
    const started = new Date(workout.session.startedAt).getTime();
    const tick = () => {
      const sec = Math.max(0, Math.floor((Date.now() - started) / 1000));
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      setElapsed(`${m}:${s.toString().padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [workout?.session.startedAt]);

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
    timer.start(rest, se.id);
    await refresh();
  };

  const patchSet = async (
    setId: string,
    patch: Partial<Pick<WorkoutSet, 'reps' | 'weight' | 'completed'>>
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

  return (
    <>
      <Stack.Screen
        options={{
          title: `Workout · ${elapsed}`,
          headerRight: () => (
            <Pressable onPress={onFinish} hitSlop={8}>
              <Text style={{ color: colors.accent, fontWeight: '800' }}>Finish</Text>
            </Pressable>
          ),
        }}
      />
      <View style={styles.container}>
        <RestTimerBar />
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
          {workout.exercises.length === 0 ? (
            <Text style={styles.empty}>
              No exercises yet. Add one from the library to start logging sets.
            </Text>
          ) : (
            workout.exercises.map((se) => (
              <ExerciseBlock
                key={se.id}
                se={se}
                onAddSet={() => onAddSet(se)}
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

function ExerciseBlock({
  se,
  onAddSet,
  onComplete,
  onPatch,
}: {
  se: SessionExerciseWithMeta;
  onAddSet: () => void;
  onComplete: (
    set: WorkoutSet,
    values?: { reps?: number | null; weight?: number | null }
  ) => void;
  onPatch: (
    setId: string,
    patch: Partial<Pick<WorkoutSet, 'reps' | 'weight' | 'completed'>>
  ) => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.exName}>{se.exerciseName}</Text>
      <Text style={styles.exMeta}>Rest {se.restSeconds ?? 60}s</Text>

      <View style={styles.setHeader}>
        <Text style={[styles.col, styles.colSet]}>Set</Text>
        <Text style={[styles.col, styles.colNum]}>lbs</Text>
        <Text style={[styles.col, styles.colNum]}>Reps</Text>
        <Text style={[styles.col, styles.colDone]}> </Text>
      </View>

      {se.sets.map((set) => (
        <SetRow key={set.id} set={set} onComplete={(values) => onComplete(set, values)} onPatch={onPatch} />
      ))}

      <Pressable style={styles.addSetBtn} onPress={onAddSet}>
        <Text style={styles.addSetText}>+ Add set</Text>
      </Pressable>
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
  onComplete,
  onPatch,
}: {
  set: WorkoutSet;
  onComplete: (values: { reps?: number | null; weight?: number | null }) => void;
  onPatch: (
    setId: string,
    patch: Partial<Pick<WorkoutSet, 'reps' | 'weight' | 'completed'>>
  ) => void;
}) {
  const [weightText, setWeightText] = useState(set.weight != null ? String(set.weight) : '');
  const [repsText, setRepsText] = useState(set.reps != null ? String(set.reps) : '');

  useEffect(() => {
    setWeightText(set.weight != null ? String(set.weight) : '');
    setRepsText(set.reps != null ? String(set.reps) : '');
  }, [set.weight, set.reps, set.id]);

  const currentValues = () => {
    const weight = parseNum(weightText);
    const repsRaw = parseNum(repsText);
    const reps = repsRaw == null ? null : Math.round(repsRaw);
    return { weight, reps };
  };

  const commit = async () => {
    const { weight, reps } = currentValues();
    await onPatch(set.id, { weight, reps });
  };

  return (
    <View style={[styles.setRow, set.completed && styles.setRowDone]}>
      <Text style={[styles.col, styles.colSet, set.completed && styles.doneText]}>
        {set.setIndex + 1}
      </Text>
      <TextInput
        style={[styles.input, styles.colNum]}
        keyboardType="decimal-pad"
        value={weightText}
        onChangeText={setWeightText}
        onBlur={commit}
        placeholder="—"
        placeholderTextColor={colors.textMuted}
        editable={!set.completed}
      />
      <TextInput
        style={[styles.input, styles.colNum]}
        keyboardType="number-pad"
        value={repsText}
        onChangeText={setRepsText}
        onBlur={commit}
        placeholder="—"
        placeholderTextColor={colors.textMuted}
        editable={!set.completed}
      />
      <Pressable
        style={[styles.check, set.completed && styles.checkOn]}
        onPress={async () => {
          if (set.completed) {
            await onPatch(set.id, { completed: false });
          } else {
            onComplete(currentValues());
          }
        }}
      >
        <Text style={styles.checkText}>{set.completed ? '✓' : '○'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: colors.textMuted },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  exName: { color: colors.text, fontWeight: '800', fontSize: 16 },
  exMeta: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm, marginTop: 2 },
  setHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  setRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  setRowDone: { opacity: 0.75 },
  col: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  colSet: { width: 36, textAlign: 'center' },
  colNum: { flex: 1, marginHorizontal: 4 },
  colDone: { width: 40 },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    color: colors.text,
    paddingVertical: 8,
    paddingHorizontal: 10,
    textAlign: 'center',
  },
  check: {
    width: 40,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  checkOn: { backgroundColor: colors.accentDim, borderColor: colors.accent },
  checkText: { color: colors.accent, fontWeight: '800', fontSize: 16 },
  doneText: { color: colors.accent },
  addSetBtn: { marginTop: 8, paddingVertical: 8 },
  addSetText: { color: colors.accent, fontWeight: '700', textAlign: 'center' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.md,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  addBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
  },
  addBtnText: { color: colors.chipActiveText, fontWeight: '800', textAlign: 'center', fontSize: 16 },
  discardLink: { paddingVertical: 6 },
  discardLinkText: { color: colors.danger, textAlign: 'center', fontWeight: '600' },
  secondaryBtn: {
    marginTop: 8,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryBtnText: { color: colors.text, fontWeight: '700' },
});
