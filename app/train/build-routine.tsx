import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Card, Label, Note, Screen } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { distinctPrimaryMuscles, getExerciseById, listExercises } from '@/db/queries';
import type { Exercise } from '@/db/schema';
import {
  createRoutine,
  getRoutineExercises,
  listRoutines,
  updateRoutine,
  type RoutineDraftExercise,
} from '@/db/workout-queries';
import { clearNewExercise, takeNewExercise } from '@/lib/exercise-handoff';
import { colors, fonts, spacing } from '@/lib/theme';

const DEFAULT_SETS = 3;
const DEFAULT_REPS = 10;
const DEFAULT_REST = 90;

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
        restSeconds: DEFAULT_REST,
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

          <View style={s.fields}>
            <NumField
              label="Sets"
              value={r.targetSets}
              onChange={(v) => patch(i, { targetSets: v })}
            />
            <NumField
              label="Reps"
              value={r.targetReps}
              onChange={(v) => patch(i, { targetReps: v })}
            />
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
        onPick={add}
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
 * The same search as Add exercise: by name, muscle, equipment or category.
 *
 * Also the way out to making one. The library is 876 exercises and does not
 * have your gym's machines in it, so a search that finds nothing has to lead
 * somewhere — otherwise the routine cannot contain the lift you actually do.
 */
function PickExercise({
  visible,
  onPick,
  onClose,
  onMakeOwn,
}: {
  visible: boolean;
  onPick: (e: Exercise) => void;
  onClose: () => void;
  onMakeOwn: (withName: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);
  const [muscles, setMuscles] = useState<string[]>([]);
  const [items, setItems] = useState<Exercise[]>([]);

  useEffect(() => {
    if (visible) void distinctPrimaryMuscles().then(setMuscles);
  }, [visible]);

  const refresh = useCallback(async () => {
    setItems(await listExercises({ search: query, primaryMuscle: muscle }));
  }, [query, muscle]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => void refresh(), 150);
    return () => clearTimeout(t);
  }, [visible, refresh]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.modal}>
        <View style={s.modalHead}>
          <Text style={s.modalTitle}>ADD AN EXERCISE</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={s.close}>✕</Text>
          </Pressable>
        </View>

        <TextInput
          style={s.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, muscle or equipment…"
          placeholderTextColor={colors.textDim}
          autoCorrect={false}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.chips}
          contentContainerStyle={{ gap: 8 }}
          keyboardShouldPersistTaps="handled"
        >
          <Chip label="All" active={!muscle} onPress={() => setMuscle(null)} />
          {muscles.map((m) => (
            <Chip
              key={m}
              label={m}
              active={muscle === m}
              onPress={() => setMuscle(muscle === m ? null : m)}
            />
          ))}
        </ScrollView>

        <Pressable style={s.makeOwn} onPress={() => onMakeOwn(query)}>
          <Text style={s.makeOwnT}>
            + Make your own{query.trim() ? ` — “${query.trim()}”` : ''}
          </Text>
          <Text style={s.makeOwnSub}>
            Photograph the machine or fill it in by hand. It comes straight back into this
            routine.
          </Text>
        </Pressable>

        <FlatList
          data={items}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable style={s.pickRow} onPress={() => onPick(item)}>
              <Text style={s.pickName}>{item.name}</Text>
              <Text style={s.pickMeta}>
                {[item.equipment, item.category === 'custom' ? 'yours' : null, item.level]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={s.pickEmpty}>
              {query.trim() || muscle
                ? 'Nothing in the library matches that. Make it yourself above and it goes into this routine.'
                : 'No exercises yet.'}
            </Text>
          }
        />
      </View>
    </Modal>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && s.chipOn]}>
      <Text style={[s.chipT, active && s.chipTOn]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
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
  chips: { maxHeight: 38, marginBottom: spacing.sm },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.track },
  chipT: { color: colors.textMuted, fontSize: 12 },
  chipTOn: { color: colors.text, fontWeight: '700' },
  makeOwn: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderBright,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginBottom: spacing.sm,
  },
  makeOwnT: { color: colors.text, fontSize: 14, fontFamily: fonts.bodySemi },
  makeOwnSub: {
    color: colors.textDim,
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 4,
    fontFamily: fonts.body,
  },
  pickRow: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickName: { color: colors.text, fontSize: 14.5, fontFamily: fonts.body },
  pickMeta: { color: colors.textDim, fontSize: 11.5, marginTop: 3, fontFamily: fonts.body },
  pickEmpty: { color: colors.textDim, fontSize: 12.5, textAlign: 'center', marginTop: 40 },
});
