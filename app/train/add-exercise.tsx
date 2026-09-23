import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { distinctPrimaryMuscles, listExercises } from '@/db/queries';
import type { Exercise } from '@/db/schema';
import { addExerciseToSession } from '@/db/workout-queries';
import { colors, spacing } from '@/lib/theme';

export default function AddExerciseScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);
  const [muscles, setMuscles] = useState<string[]>([]);
  const [items, setItems] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);

  const sid = sessionId ? decodeURIComponent(sessionId) : '';

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listExercises({ search, primaryMuscle: muscle });
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }, [search, muscle]);

  useEffect(() => {
    void distinctPrimaryMuscles().then(setMuscles);
  }, []);

  // Coming back from creating a custom exercise: it is new, so the list has to
  // be re-read or the thing just made is missing from it.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  useEffect(() => {
    const t = setTimeout(refresh, 150);
    return () => clearTimeout(t);
  }, [refresh]);

  const onPick = async (exercise: Exercise) => {
    if (!sid || adding) return;
    setAdding(exercise.id);
    try {
      await addExerciseToSession(sid, exercise.id, { targetSets: 3, targetReps: 10 });
      router.back();
    } finally {
      setAdding(null);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Add exercise' }} />
      <View style={styles.container}>
        <TextInput
          style={styles.search}
          placeholder="Search name, muscle or equipment…"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoFocus
        />

        {/*
          Typing a muscle now finds exercises for it, but only if you know to
          try. The chips say out loud that the library can be browsed by body
          part, which is what someone standing in front of an unfamiliar
          machine actually wants.
        */}
        {muscles.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chips}
            contentContainerStyle={styles.chipsInner}
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
        ) : null}

        <Pressable
          style={styles.newBtn}
          onPress={() =>
            router.push(`/exercise/new?sessionId=${encodeURIComponent(sid)}`)
          }
        >
          <Text style={styles.newBtnText}>
            + Not in the list — photograph the machine
          </Text>
        </Pressable>

        {loading && items.length === 0 ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={styles.row}
                onPress={() => onPick(item)}
                disabled={adding === item.id}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  <Text style={styles.rowMeta}>
                    {[item.equipment, item.level].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={styles.plus}>{adding === item.id ? '…' : '+'}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              loading ? null : (
                <View style={styles.emptyWrap}>
                  <Text style={styles.empty}>
                    {muscle
                      ? `Nothing in the library for ${muscle}${search ? ` matching “${search}”` : ''}.`
                      : `Nothing matches “${search}”.`}
                  </Text>
                  {/*
                    A dead end with no way out is the worst version of this
                    screen: the whole reason to search a muscle is that you are
                    standing in front of something and want to log it.
                  */}
                  <Pressable
                    style={styles.emptyBtn}
                    onPress={() =>
                      router.push(`/exercise/new?sessionId=${encodeURIComponent(sid)}`)
                    }
                  >
                    <Text style={styles.emptyBtnText}>Make your own →</Text>
                  </Pressable>
                  <Text style={styles.emptyHint}>
                    Photograph the machine and the AI fills it in, or type it yourself.
                  </Text>
                </View>
              )
            }
          />
        )}
      </View>
    </>
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
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipOn]}>
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.md },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chips: { maxHeight: 38, marginBottom: spacing.sm },
  chipsInner: { gap: 8, paddingRight: spacing.md },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.track },
  chipText: { color: colors.textMuted, fontSize: 12 },
  chipTextOn: { color: colors.text, fontWeight: '700' },
  newBtn: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderBright,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  newBtnText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  rowTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  rowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  plus: { color: colors.accent, fontSize: 22, fontWeight: '800', marginLeft: 8 },
  emptyWrap: { marginTop: 36, alignItems: 'center', gap: 10, paddingHorizontal: spacing.md },
  empty: { color: colors.textMuted, textAlign: 'center' },
  emptyBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  emptyBtnText: { color: colors.onAccent, fontWeight: '800', fontSize: 13 },
  emptyHint: { color: colors.textDim, fontSize: 12, textAlign: 'center', lineHeight: 17 },
});
