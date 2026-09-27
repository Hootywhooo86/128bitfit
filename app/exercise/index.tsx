import { Link } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { countLibraryExercises, distinctPrimaryMuscles, equipmentGroupCounts, listExercises } from '@/db/queries';
import type { Exercise } from '@/db/schema';
import { EQUIPMENT_GROUPS, type EquipmentGroup } from '@/lib/equipment-groups';
import { exerciseImageSource, parseJsonArray } from '@/lib/exercise-images';
import { colors, spacing, themedStyles } from '@/lib/theme';

export default function ExerciseLibraryScreen() {
  const [search, setSearch] = useState('');
  const [equipment, setEquipment] = useState<EquipmentGroup | null>(null);
  const [muscle, setMuscle] = useState<string | null>(null);
  const [equipmentOptions, setEquipmentOptions] = useState<typeof EQUIPMENT_GROUPS>([]);
  const [muscleOptions, setMuscleOptions] = useState<string[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [items, setItems] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [counts, ms, n] = await Promise.all([
          equipmentGroupCounts(),
          distinctPrimaryMuscles(),
          countLibraryExercises(),
        ]);
        // Only groups something is actually in: a chip that always shows
        // nothing is a dead button.
        setEquipmentOptions(EQUIPMENT_GROUPS.filter((g) => (counts.get(g.id) ?? 0) > 0));
        setMuscleOptions(ms);
        setTotal(n);
      } catch (e) {
        setError(`Could not load the filters: ${e instanceof Error ? e.message : String(e)}`);
      }
    })();
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listExercises({
        search,
        equipmentGroup: equipment,
        primaryMuscle: muscle,
      });
      setItems(rows);
      setError(null);
    } catch (e) {
      setItems([]);
      setError(`Could not read the exercise library: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [search, equipment, muscle]);

  const filtered = Boolean(search.trim() || equipment || muscle);
  const clearFilters = () => {
    setSearch('');
    setEquipment(null);
    setMuscle(null);
  };

  useEffect(() => {
    const t = setTimeout(refresh, 150);
    return () => clearTimeout(t);
  }, [refresh]);

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search name, muscle or equipment…"
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />

      <Text style={styles.filterLabel}>Equipment</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
        <Chip label="All" active={!equipment} onPress={() => setEquipment(null)} />
        {equipmentOptions.map((g) => (
          // Tapping the active chip again clears it, like the muscle chips.
          <Chip
            key={g.id}
            label={g.label}
            active={equipment === g.id}
            onPress={() => setEquipment(equipment === g.id ? null : g.id)}
          />
        ))}
      </ScrollView>

      <Text style={styles.filterLabel}>Primary muscle</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips}>
        <Chip label="All" active={!muscle} onPress={() => setMuscle(null)} />
        {muscleOptions.map((m) => (
          <Chip key={m} label={m} active={muscle === m} onPress={() => setMuscle(muscle === m ? null : m)} />
        ))}
      </ScrollView>

      <Link href="/exercise/new" asChild>
        <Pressable style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Add exercise — photograph the machine</Text>
        </Pressable>
      </Link>

      <View style={styles.countRow}>
        <Text style={styles.count}>
          {loading
            ? 'Searching…'
            : filtered && total != null
              ? `${items.length.toLocaleString()} of ${total.toLocaleString()} exercises`
              : `${items.length.toLocaleString()} exercise${items.length === 1 ? '' : 's'}`}
        </Text>
        {filtered ? (
          <Pressable onPress={clearFilters} hitSlop={8}>
            <Text style={styles.clear}>Clear filters</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading && items.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          initialNumToRender={12}
          windowSize={7}
          renderItem={({ item }) => {
            const muscles = parseJsonArray(item.primaryMuscles);
            return (
              <Link href={`/exercise/${encodeURIComponent(item.id)}`} asChild>
                <Pressable style={styles.row}>
                  <Thumb stored={parseJsonArray(item.images)[0]} />
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
            !loading && !error ? (
              <View style={{ alignItems: 'center' }}>
                <Text style={styles.empty}>
                  {filtered ? 'No exercises match these filters.' : 'The exercise library is empty.'}
                </Text>
                {filtered ? (
                  <Pressable onPress={clearFilters} style={styles.clearBtn}>
                    <Text style={styles.addBtnText}>Clear filters</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

/**
 * The exercise's first picture, or a blank tile. Bundled RepDB pictures work
 * offline; free-exercise-db ones are fetched, so with no signal the tile stays
 * blank rather than showing a broken image.
 */
function Thumb({ stored }: { stored: string | undefined }) {
  const [failed, setFailed] = useState(false);
  const source = failed ? null : exerciseImageSource(stored);
  return (
    <View style={styles.thumb}>
      {source ? (
        <Image source={source} style={styles.thumbImg} resizeMode="contain" onError={() => setFailed(true)} />
      ) : null}
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

const styles = themedStyles(() => StyleSheet.create({
  addBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 12,
  },
  addBtnText: { color: colors.text, fontSize: 13, fontWeight: '600' },
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
  countRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  count: { color: colors.textMuted, fontSize: 12 },
  clear: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  clearBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 12,
  },
  error: { color: colors.danger, fontSize: 13, marginBottom: 8 },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  // The pictures are drawn on white; a white tile keeps them from floating.
  thumbImg: { width: '100%', height: '100%', backgroundColor: '#ffffff' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  rowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  chevron: { color: colors.accent, fontSize: 22, marginLeft: 8 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
}));
