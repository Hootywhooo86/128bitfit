import { Link } from 'expo-router';
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
import { distinctEquipment, distinctPrimaryMuscles, listExercises } from '@/db/queries';
import type { Exercise } from '@/db/schema';
import { parseJsonArray } from '@/lib/exercise-images';
import { colors, spacing } from '@/lib/theme';

export default function ExerciseLibraryScreen() {
  const [search, setSearch] = useState('');
  const [equipment, setEquipment] = useState<string | null>(null);
  const [muscle, setMuscle] = useState<string | null>(null);
  const [equipmentOptions, setEquipmentOptions] = useState<string[]>([]);
  const [muscleOptions, setMuscleOptions] = useState<string[]>([]);
  const [items, setItems] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [eq, ms] = await Promise.all([distinctEquipment(), distinctPrimaryMuscles()]);
      setEquipmentOptions(eq);
      setMuscleOptions(ms);
    })();
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listExercises({
        search,
        equipment,
        primaryMuscle: muscle,
      });
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }, [search, equipment, muscle]);

  useEffect(() => {
    const t = setTimeout(refresh, 150);
    return () => clearTimeout(t);
  }, [refresh]);

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search exercises…"
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />

      <Text style={styles.filterLabel}>Equipment</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
        <Chip label="All" active={!equipment} onPress={() => setEquipment(null)} />
        {equipmentOptions.map((e) => (
          <Chip key={e} label={e} active={equipment === e} onPress={() => setEquipment(e)} />
        ))}
      </ScrollView>

      <Text style={styles.filterLabel}>Primary muscle</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
        <Chip label="All" active={!muscle} onPress={() => setMuscle(null)} />
        {muscleOptions.map((m) => (
          <Chip key={m} label={m} active={muscle === m} onPress={() => setMuscle(m)} />
        ))}
      </ScrollView>

      <Text style={styles.count}>
        {loading ? 'Searching…' : `${items.length} exercise${items.length === 1 ? '' : 's'}`}
      </Text>

      {loading && items.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          renderItem={({ item }) => {
            const muscles = parseJsonArray(item.primaryMuscles);
            return (
              <Link href={`/exercise/${encodeURIComponent(item.id)}`} asChild>
                <Pressable style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{item.name}</Text>
                    <Text style={styles.rowMeta}>
                      {[item.equipment, item.level, muscles.slice(0, 2).join(', ')]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              </Link>
            );
          }}
          ListEmptyComponent={
            !loading ? <Text style={styles.empty}>No exercises match these filters.</Text> : null
          }
        />
      )}
    </View>
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
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
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
  filterLabel: { color: colors.textMuted, fontSize: 12, marginTop: 4, marginBottom: 4 },
  chips: { maxHeight: 40, marginBottom: spacing.sm },
  chip: {
    backgroundColor: colors.chip,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.chipActive, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 12 },
  chipTextActive: { color: colors.chipActiveText, fontWeight: '700' },
  count: { color: colors.textMuted, fontSize: 12, marginBottom: 8 },
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
  chevron: { color: colors.accent, fontSize: 22, marginLeft: 8 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
});
