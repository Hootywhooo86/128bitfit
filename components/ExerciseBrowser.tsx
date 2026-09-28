import { useRouter } from 'expo-router';
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
import { capitalise, exerciseMetaLine } from '@/lib/exercise-meta';
import { colors, fonts, spacing, themedStyles } from '@/lib/theme';

/**
 * The exercise library's search, filters and list, shared by the library and
 * both pickers so the three cannot drift apart again.
 *
 * - `browse`: tapping a card opens it (the library).
 * - `multi`: tapping toggles a tick, in tap order; long-press opens it.
 * - `single`: tapping picks straight away (swap); long-press opens it.
 */
export function ExerciseBrowser({
  mode,
  selectedIds = [],
  onPress,
  header,
  emptyAction,
  autoFocus,
  reloadKey,
  canOpen = true,
}: {
  mode: 'browse' | 'multi' | 'single';
  selectedIds?: readonly string[];
  /** Called for `multi` and `single`; `browse` opens the exercise itself. */
  onPress?: (exercise: Exercise) => void;
  /**
   * Sits between the filters and the count: "+ Add exercise", "Make your own".
   * A function gets the search text, so "Make your own" can carry it over.
   */
  header?: React.ReactNode | ((search: string) => React.ReactNode);
  /** Offered under "No exercises match", so a dead end has a way out. */
  emptyAction?: (search: string) => React.ReactNode;
  autoFocus?: boolean;
  /** Change it to re-read the list, e.g. after making an exercise. */
  reloadKey?: unknown;
  /**
   * Whether long-press opens the exercise. Off inside a Modal, where the
   * opened screen would land behind the modal, out of sight.
   */
  canOpen?: boolean;
}) {
  const router = useRouter();
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
  }, [reloadKey]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listExercises({ search, equipmentGroup: equipment, primaryMuscle: muscle }));
      setError(null);
    } catch (e) {
      setItems([]);
      setError(`Could not read the exercise library: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
    // reloadKey is a deliberate dependency: it is how a caller asks for a re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, equipment, muscle, reloadKey]);

  useEffect(() => {
    const t = setTimeout(refresh, 150);
    return () => clearTimeout(t);
  }, [refresh]);

  const filtered = Boolean(search.trim() || equipment || muscle);
  const clearFilters = () => {
    setSearch('');
    setEquipment(null);
    setMuscle(null);
  };
  const open = (e: Exercise) => router.push(`/exercise/${encodeURIComponent(e.id)}`);

  return (
    <View style={styles.root}>
      <TextInput
        style={styles.search}
        placeholder="Search name, muscle or equipment…"
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        autoFocus={autoFocus}
        clearButtonMode="while-editing"
      />

      <Text style={styles.filterLabel}>Equipment</Text>
      <ChipRow>
        <Chip label="All" active={!equipment} onPress={() => setEquipment(null)} />
        {equipmentOptions.map((g) => (
          // Tapping the active chip again clears it.
          <Chip
            key={g.id}
            label={g.label}
            active={equipment === g.id}
            onPress={() => setEquipment(equipment === g.id ? null : g.id)}
          />
        ))}
      </ChipRow>

      <Text style={styles.filterLabel}>Muscle</Text>
      <ChipRow>
        <Chip label="All" active={!muscle} onPress={() => setMuscle(null)} />
        {muscleOptions.map((m) => (
          <Chip
            key={m}
            label={capitalise(m)}
            active={muscle === m}
            onPress={() => setMuscle(muscle === m ? null : m)}
          />
        ))}
      </ChipRow>

      {header ? (
        <View style={styles.header}>{typeof header === 'function' ? header(search) : header}</View>
      ) : null}

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
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 24 }}
          initialNumToRender={12}
          windowSize={7}
          extraData={selectedIds}
          renderItem={({ item }) => (
            <ExerciseCard
              exercise={item}
              mode={mode}
              selected={selectedIds.includes(item.id)}
              onPress={() => (mode === 'browse' ? open(item) : onPress?.(item))}
              onLongPress={mode === 'browse' || !canOpen ? undefined : () => open(item)}
            />
          )}
          ListEmptyComponent={
            !loading && !error ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.empty}>
                  {filtered ? 'No exercises match these filters.' : 'The exercise library is empty.'}
                </Text>
                {filtered ? (
                  <Pressable onPress={clearFilters} style={styles.clearBtn}>
                    <Text style={styles.clearBtnText}>Clear filters</Text>
                  </Pressable>
                ) : null}
                {emptyAction?.(search)}
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chips}
      contentContainerStyle={styles.chipsInner}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ExerciseCard({
  exercise,
  mode,
  selected,
  onPress,
  onLongPress,
}: {
  exercise: Exercise;
  mode: 'browse' | 'multi' | 'single';
  selected: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const meta = exerciseMetaLine(exercise);
  return (
    <Pressable
      style={[styles.row, selected && styles.rowSelected]}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole={mode === 'multi' ? 'checkbox' : 'button'}
      accessibilityState={mode === 'multi' ? { checked: selected } : undefined}
    >
      <Thumb stored={parseJsonArray(exercise.images)[0]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{exercise.name}</Text>
        {meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}
      </View>
      {mode === 'multi' ? (
        <View style={[styles.tick, selected && styles.tickOn]}>
          {selected ? <Text style={styles.tickMark}>✓</Text> : null}
        </View>
      ) : (
        <Text style={styles.chevron}>›</Text>
      )}
    </Pressable>
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

/**
 * A bar pinned under a picker: "Add 3 exercises". Greyed out, and says so,
 * until something is picked.
 */
export function AddSelectedBar({
  count,
  busy,
  onPress,
}: {
  count: number;
  busy?: boolean;
  onPress: () => void;
}) {
  const off = count === 0 || busy;
  return (
    <View style={styles.bar}>
      <Pressable style={[styles.barBtn, off && styles.barBtnOff]} onPress={onPress} disabled={off}>
        <Text style={[styles.barText, off && styles.barTextOff]}>
          {busy
            ? 'Adding…'
            : count === 0
              ? 'Tap exercises to pick them'
              : `Add ${count} exercise${count === 1 ? '' : 's'}`}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  root: { flex: 1 },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    minHeight: 46,
    color: colors.text,
    fontSize: 15,
    fontFamily: fonts.body,
    textAlignVertical: 'center',
  },
  filterLabel: { color: colors.textMuted, fontSize: 12, marginTop: 12, marginBottom: 6 },
  // No height cap: a capped row clipped every chip in half at a large system
  // font size. flexGrow 0 stops a horizontal ScrollView swallowing the column.
  chips: { flexGrow: 0, flexShrink: 0 },
  chipsInner: { gap: 8, alignItems: 'center', paddingRight: spacing.md },
  chip: {
    backgroundColor: colors.chip,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 7,
    minHeight: 34,
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.chipActive, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 13, lineHeight: 18 },
  chipTextActive: { color: colors.chipActiveText, fontWeight: '700' },
  header: { marginTop: 14 },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 8,
  },
  count: { color: colors.textMuted, fontSize: 12 },
  clear: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  error: { color: colors.danger, fontSize: 13, marginBottom: 8 },
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
  rowSelected: { borderColor: colors.accent },
  rowTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  rowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  chevron: { color: colors.accent, fontSize: 22, marginLeft: 8 },
  tick: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.borderBright,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  tickMark: { color: colors.onAccent, fontSize: 14, fontWeight: '800' },
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
  emptyWrap: { alignItems: 'center', marginTop: 40, gap: 12, paddingHorizontal: spacing.md },
  empty: { color: colors.textMuted, textAlign: 'center' },
  clearBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  clearBtnText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  bar: { paddingTop: spacing.sm, paddingBottom: spacing.md, backgroundColor: colors.bg },
  barBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 15, alignItems: 'center' },
  barBtnOff: { backgroundColor: colors.surfaceAlt },
  barText: { color: colors.onAccent, fontSize: 15, fontWeight: '800' },
  barTextOff: { color: colors.textMuted, fontWeight: '600' },
}));
