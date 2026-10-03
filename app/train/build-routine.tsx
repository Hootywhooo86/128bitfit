import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AddSelectedBar, ExerciseBrowser } from '@/components/ExerciseBrowser';
import { Card, Label, Note, Screen } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { REST_DEFAULT_SECONDS, getDefaultRestSeconds } from '@/db/rest-settings';
import { getExerciseById } from '@/db/queries';
import type { Exercise } from '@/db/schema';
import {
  createRoutine,
  getRoutineExercises,
  listRoutines,
  updateRoutine,
  type RoutineDraftExercise,
} from '@/db/workout-queries';
import { clearNewExercise, takeNewExercise } from '@/lib/exercise-handoff';
import { toggleById } from '@/lib/exercise-meta';
import { colors, fonts, spacing, themedStyles } from '@/lib/theme';
import { defaultTrack } from '@/lib/track-mode';

const DEFAULT_SETS = 3;
const DEFAULT_REPS = 10;

type Row = RoutineDraftExercise & { name: string };

/**
 * Build a routine without starting a workout.
 *
 * There was no way to make one at all: routines could only arrive from an
 * import or the three seeded starters, so planning a session meant starting a
 * freestyle workout, picking exercises as you went, and keeping nothing.
 *
 * Doubles as the editor. Passing `id` loads that routine and saves over it
 * rather than making a second one, so a routine that sessions already
 * reference keeps pointing at something real.
 */
export default function BuildRoutineScreen() {
  const { ready } = useDb();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const routineId = id ? decodeURIComponent(id) : null;

  const [name, setName] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [defaultRest, setDefaultRest] = useState(REST_DEFAULT_SECONDS);

  useEffect(() => {
    void getDefaultRestSeconds().then(setDefaultRest).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    (async () => {
      if (routineId) {
        const [all, exercises] = await Promise.all([
          listRoutines(),
          getRoutineExercises(routineId),
        ]);
        if (!alive) return;
        setName(all.find((r) => r.id === routineId)?.name ?? '');
        setRows(
          exercises.map((e) => ({
            exerciseId: e.exerciseId,
            name: e.exerciseName,
            targetSets: e.targetSets,
            targetReps: e.targetReps,
            restSeconds: e.restSeconds,
            notes: e.notes,
            track: e.track ?? defaultTrack(e.exerciseName),
          }))
        );
      }
      if (alive) setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [ready, routineId]);

  const add = (exercise: Exercise) => {
    setPicking(false);
    setRows((prev) => [
      ...prev,
      {
        exerciseId: exercise.id,
        name: exercise.name,
        targetSets: DEFAULT_SETS,
        targetReps: DEFAULT_REPS,
        restSeconds: defaultRest,
        track: defaultTrack(exercise.name),
      },
    ]);
  };

  /**
   * Picks up an exercise made on the custom-exercise screen while this draft
   * was open, and puts it straight into the routine.
   *
   * Taking it clears it, so coming back to this screen for any other reason
   * does not add the same exercise a second time.
   */
  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      const madeId = takeNewExercise();
      if (!madeId) return;
      let alive = true;
      void (async () => {
        const made = await getExerciseById(madeId);
        if (alive && made) add(made);
      })();
      return () => {
        alive = false;
      };
      // add is stable enough: it only calls setRows, which never changes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready])
  );

  const patch = (i: number, p: Partial<Row>) =>
    setRows((prev) => prev.map((r, n) => (n === i ? { ...r, ...p } : r)));

  const remove = (i: number) => setRows((prev) => prev.filter((_, n) => n !== i));

  /** Order is position, so moving a row is the only way to reorder. */
  const move = (i: number, by: -1 | 1) =>
    setRows((prev) => {
      const to = i + by;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[to]] = [next[to], next[i]];
      return next;
    });

  const save = async () => {
    if (saving) return;
    if (!name.trim()) {
      Alert.alert('Name it', 'Give the routine a name so you can find it on Train.');
      return;
    }
    if (rows.length === 0) {
      Alert.alert('Nothing in it', 'Add at least one exercise, or there is nothing to run.');
      return;
    }
    setSaving(true);
    try {
      const exercises: RoutineDraftExercise[] = rows.map((r) => ({
        exerciseId: r.exerciseId,
        targetSets: r.targetSets,
        targetReps: r.targetReps,
        restSeconds: r.restSeconds,
        notes: r.notes ?? null,
        track: r.track ?? null,
      }));
      if (routineId) {
        await updateRoutine(routineId, { name, exercises });
      } else {
        await createRoutine({ name, exercises });
      }
      router.replace('/(tabs)/train');
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!ready || loading) {
    return (
      <Screen section={routineId ? 'Edit routine' : 'New routine'} back>
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen section={routineId ? 'Edit routine' : 'New routine'} back>
      <Label>NAME</Label>
      <TextInput
        style={s.input}
        value={name}
        onChangeText={setName}
        placeholder="Push day, Leg day, Wednesday…"
        placeholderTextColor={colors.textMuted}
      />

      <Label>EXERCISES</Label>
      {rows.length === 0 ? (
        <Note>
          Nothing in it yet. Add exercises and set how many sets and reps you are aiming for —
          the numbers are targets, and what you actually lift is what gets logged.
        </Note>
      ) : null}

      {rows.map((r, i) => (
        <Card key={`${r.exerciseId}-${i}`}>
          <View style={s.head}>
            <Text style={s.name}>{r.name}</Text>
            <View style={s.arrows}>
              <Pressable onPress={() => move(i, -1)} hitSlop={8} disabled={i === 0}>
                <Text style={[s.arrow, i === 0 && s.arrowOff]}>↑</Text>
              </Pressable>
              <Pressable
                onPress={() => move(i, 1)}
                hitSlop={8}
                disabled={i === rows.length - 1}
              >
                <Text style={[s.arrow, i === rows.length - 1 && s.arrowOff]}>↓</Text>
              </Pressable>
              <Pressable onPress={() => remove(i)} hitSlop={8}>
                <Text style={s.del}>✕</Text>
              </Pressable>
            </View>
          </View>

          {/* Logged as weight x reps, or weight x distance for carries and sleds. */}
          <View style={s.trackRow}>
            {(['reps', 'distance'] as const).map((m) => (
              <Pressable
                key={m}
                style={[s.trackChip, (r.track ?? 'reps') === m && s.trackChipOn]}
                onPress={() => patch(i, { track: m })}
              >
                <Text style={[s.trackChipT, (r.track ?? 'reps') === m && s.trackChipTOn]}>
                  {m === 'reps' ? 'Weight × reps' : 'Weight × distance'}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={s.fields}>
            <NumField
              label="Sets"
              value={r.targetSets}
              onChange={(v) => patch(i, { targetSets: v })}
            />
            {r.track === 'distance' ? null : (
              <NumField
                label="Reps"
                value={r.targetReps}
                onChange={(v) => patch(i, { targetReps: v })}
              />
            )}
            <NumField
              label="Rest (s)"
              value={r.restSeconds}
              onChange={(v) => patch(i, { restSeconds: v })}
            />
          </View>
        </Card>
      ))}

      <Pressable style={s.add} onPress={() => setPicking(true)}>
        <Text style={s.addT}>+ Add an exercise</Text>
      </Pressable>

      <Pressable style={[s.save, saving && { opacity: 0.6 }]} onPress={() => void save()}>
        <Text style={s.saveT}>
          {saving ? 'SAVING…' : routineId ? 'SAVE CHANGES' : 'SAVE ROUTINE'}
        </Text>
      </Pressable>

      <PickExercise
        visible={picking}
        onPick={(list) => {
          setPicking(false);
          list.forEach(add);
        }}
        onClose={() => setPicking(false)}
        onMakeOwn={(withName) => {
          setPicking(false);
          // Nothing staged should survive into a new trip out, or a stale id
          // from an abandoned one would land in this routine.
          clearNewExercise();
          router.push(
            withName.trim()
              ? `/exercise/new?returnTo=routine&name=${encodeURIComponent(withName.trim())}`
              : '/exercise/new?returnTo=routine'
          );
        }}
      />
    </Screen>
  );
}

/** A target that can be left blank — blank means "no target", not zero. */
function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={s.fieldInput}
        value={value == null ? '' : String(value)}
        onChangeText={(t) => {
          const n = Number(t.replace(/[^0-9]/g, ''));
          onChange(t.trim() === '' || !Number.isFinite(n) || n <= 0 ? null : n);
        }}
        keyboardType="number-pad"
        placeholder="–"
        placeholderTextColor={colors.textDim}
      />
    </View>
  );
}

/**
 * The exercise library, as a picker: tap as many as the routine needs, in the
 * order they should run, then add them together.
 *
 * Also the way out to making one. The library does not have your gym's
 * machines in it, so a search that finds nothing has to lead somewhere —
 * otherwise the routine cannot contain the lift you actually do.
 */
function PickExercise({
  visible,
  onPick,
  onClose,
  onMakeOwn,
}: {
  visible: boolean;
  onPick: (exercises: Exercise[]) => void;
  onClose: () => void;
  onMakeOwn: (withName: string) => void;
}) {
  const [picked, setPicked] = useState<Exercise[]>([]);

  // A fresh pick every time it opens; last visit's ticks are not this one's.
  useEffect(() => {
    if (visible) setPicked([]);
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.modal}>
        <View style={s.modalHead}>
          <Text style={s.modalTitle}>ADD EXERCISES</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={s.close}>✕</Text>
          </Pressable>
        </View>

        {visible ? (
          <ExerciseBrowser
            mode="multi"
            canOpen={false}
            selectedIds={picked.map((e) => e.id)}
            onPress={(e) => setPicked((prev) => toggleById(prev, e))}
            header={(query) => (
              <Pressable style={s.makeOwn} onPress={() => onMakeOwn(query)}>
                <Text style={s.makeOwnT}>
                  + Make your own{query.trim() ? ` — “${query.trim()}”` : ''}
                </Text>
                <Text style={s.makeOwnSub}>
                  Photograph the machine or fill it in by hand. It comes straight back into this
                  routine.
                </Text>
              </Pressable>
            )}
          />
        ) : null}
        <AddSelectedBar count={picked.length} onPress={() => onPick(picked)} />
      </View>
    </Modal>
  );
}

const s = themedStyles(() => StyleSheet.create({
  trackRow: { flexDirection: 'row', gap: 8, marginTop: spacing.sm },
  trackChip: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  trackChipOn: { borderColor: colors.accent, backgroundColor: colors.surfaceAlt },
  trackChipT: { color: colors.textMuted, fontSize: 12.5, fontFamily: fonts.bodySemi },
  trackChipTOn: { color: colors.text },
  center: { paddingVertical: 80, alignItems: 'center' },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
    marginBottom: spacing.sm,
    fontFamily: fonts.body,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { color: colors.text, fontSize: 15, fontFamily: fonts.bodySemi, flex: 1 },
  arrows: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  arrow: { color: colors.textMuted, fontSize: 18 },
  arrowOff: { color: colors.border },
  del: { color: colors.danger, fontSize: 16 },
  fields: { flexDirection: 'row', gap: spacing.sm, marginTop: 10 },
  field: { flex: 1 },
  fieldLabel: { color: colors.textDim, fontSize: 11, marginBottom: 4, fontFamily: fonts.body },
  fieldInput: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: colors.text,
    fontSize: 15,
    textAlign: 'center',
  },
  add: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderBright,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  addT: { color: colors.text, fontWeight: '700', fontSize: 13 },
  save: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  saveT: { fontFamily: fonts.pixel, fontSize: 10, color: colors.onAccent, letterSpacing: 1 },
  modal: { flex: 1, backgroundColor: colors.bg, padding: spacing.md, paddingTop: 48 },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalTitle: { fontFamily: fonts.pixel, fontSize: 10, color: colors.text, letterSpacing: 1 },
  close: { color: colors.textMuted, fontSize: 22 },
  makeOwn: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderBright,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  makeOwnT: { color: colors.text, fontSize: 14, fontFamily: fonts.bodySemi },
  makeOwnSub: {
    color: colors.textDim,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 4,
    fontFamily: fonts.body,
  },
}));
