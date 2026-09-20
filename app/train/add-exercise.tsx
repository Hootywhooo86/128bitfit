import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { listExercises } from '@/db/queries';
import type { Exercise } from '@/db/schema';
import { addExerciseToSession } from '@/db/workout-queries';
import { colors, spacing } from '@/lib/theme';

export default function AddExerciseScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<string | null>(null);

  const sid = sessionId ? decodeURIComponent(sessionId) : '';

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listExercises({ search });
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }, [search]);

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
          placeholder="Search exercises…"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoFocus
        />
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
              !loading ? <Text style={styles.empty}>No matches.</Text> : null
            }
          />
        )}
      </View>
    </>
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
  rowTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  rowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  plus: { color: colors.accent, fontSize: 22, fontWeight: '800', marginLeft: 8 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
});
