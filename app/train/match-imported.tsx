import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Card, Label, Note, Screen } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { listExercises } from '@/db/queries';
import type { Exercise } from '@/db/schema';
import {
  listUntaggedExercises,
  mergeExerciseInto,
  type UntaggedExercise,
} from '@/db/workout-queries';
import { colors, fonts, spacing, themedStyles } from '@/lib/theme';

/**
 * Say what an imported exercise actually was, so the muscle map can colour it.
 *
 * openGym's backup references its built-in exercises by number and carries
 * neither their names nor their muscles, so they arrive as "openGym 0577" with
 * nothing attached. Every set, date, weight and rep is intact — but the map has
 * no idea what they worked, so it stays grey and looks broken when it is only
 * being honest.
 *
 * Matching one to a real exercise re-points its sets rather than copying them:
 * the history keeps its weights and dates and simply belongs to something the
 * app knows the muscles for, so the map fills in backwards through the whole
 * year at once.
 *
 * Sorted by set count because this is not meant to be finished. The top few
 * carry most of the map — on a real backup the first twelve were 1,558 sets of
 * 3,956 — and leaving the tail untagged costs only those exercises' colour.
 */
export default function MatchImportedScreen() {
  const { ready } = useDb();
  const router = useRouter();
  const [rows, setRows] = useState<UntaggedExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState<UntaggedExercise | null>(null);

  const refresh = useCallback(async () => {
    if (!ready) return;
    try {
      setRows(await listUntaggedExercises());
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const match = async (target: Exercise) => {
    const from = picking;
    if (!from) return;
    setPicking(null);
    try {
      await mergeExerciseInto(from.id, target.id);
      await refresh();
    } catch (e) {
      Alert.alert('Could not match', e instanceof Error ? e.message : String(e));
    }
  };

  if (!ready || loading) {
    return (
      <Screen section="Match" back>
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  const totalSets = rows.reduce((t, r) => t + r.setCount, 0);

  return (
    <Screen section="Match" back>
      {rows.length === 0 ? (
        <>
          <Label>NOTHING TO MATCH</Label>
          <Note>
            Every exercise you have logged knows which muscles it works, so the map has all it
            needs.
          </Note>
        </>
      ) : (
        <>
          <Label>
            {rows.length} EXERCISES · {totalSets} SETS
          </Label>
          <Note>
            These came from an import that did not say what they work, so they colour nothing on
            the muscle map. Say what each one was and its whole history — every set, weight and
            date — starts counting toward the right muscles.
          </Note>
          <Note>
            Start at the top. These are ordered by how many sets you have logged, so the first few
            are most of the map.
          </Note>
          {rows.map((r) => (
            <Card key={r.id}>
              <View style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{r.name}</Text>
                  <Text style={s.meta}>
                    {r.setCount} set{r.setCount === 1 ? '' : 's'} logged
                  </Text>
                </View>
                <Pressable style={s.btn} onPress={() => setPicking(r)}>
                  <Text style={s.btnT}>Match →</Text>
                </Pressable>
              </View>
            </Card>
          ))}
        </>
      )}

      <Pressable style={s.back} onPress={() => router.replace('/(tabs)/train')}>
        <Text style={s.backT}>Back to Train →</Text>
      </Pressable>

      <PickExercise
        from={picking}
        onPick={(e) => void match(e)}
        onClose={() => setPicking(null)}
      />
    </Screen>
  );
}

/** Search the library for what this actually was. */
function PickExercise({
  from,
  onPick,
  onClose,
}: {
  from: UntaggedExercise | null;
  onPick: (e: Exercise) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Exercise[]>([]);

  React.useEffect(() => {
    if (!from) return;
    setQuery('');
    setItems([]);
  }, [from]);

  React.useEffect(() => {
    if (!from) return;
    const t = setTimeout(() => {
      void listExercises({ search: query }).then(setItems);
    }, 150);
    return () => clearTimeout(t);
  }, [query, from]);

  return (
    <Modal visible={from != null} animationType="slide" onRequestClose={onClose}>
      <View style={s.modal}>
        <View style={s.modalHead}>
          <Text style={s.modalTitle} numberOfLines={1}>
            {from?.name ?? ''}
          </Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={s.close}>✕</Text>
          </Pressable>
        </View>
        <Text style={s.modalNote}>
          What was this? Its {from?.setCount ?? 0} sets move to whatever you pick — nothing is
          lost, and the map fills in from your whole history.
        </Text>

        <TextInput
          style={s.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search name, muscle or equipment…"
          placeholderTextColor={colors.textDim}
          autoCorrect={false}
          autoFocus
        />

        <FlatList
          data={items}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable style={s.pickRow} onPress={() => onPick(item)}>
              <Text style={s.pickName}>{item.name}</Text>
              <Text style={s.pickMeta}>
                {[item.equipment, item.level].filter(Boolean).join(' · ')}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={s.empty}>
              {query ? 'Nothing matches that.' : 'Search for the exercise this was.'}
            </Text>
          }
        />
      </View>
    </Modal>
  );
}

const s = themedStyles(() => StyleSheet.create({
  center: { paddingVertical: 80, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { color: colors.text, fontSize: 15, fontFamily: fonts.bodySemi },
  meta: { color: colors.textMuted, fontSize: 12.5, marginTop: 3, fontFamily: fonts.body },
  btn: {
    borderWidth: 1,
    borderColor: colors.borderBright,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  btnT: { color: colors.text, fontSize: 12.5, fontFamily: fonts.bodySemi },
  back: { marginTop: spacing.lg, alignItems: 'center' },
  backT: { color: colors.accent, fontSize: 12.5, fontFamily: fonts.bodySemi },
  modal: { flex: 1, backgroundColor: colors.bg, padding: spacing.md, paddingTop: 48 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: colors.text, fontSize: 16, fontFamily: fonts.bodySemi, flex: 1 },
  close: { color: colors.textMuted, fontSize: 22, marginLeft: spacing.sm },
  modalNote: {
    color: colors.textMuted,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 6,
    fontFamily: fonts.body,
  },
  search: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    fontFamily: fonts.body,
  },
  pickRow: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickName: { color: colors.text, fontSize: 14.5, fontFamily: fonts.body },
  pickMeta: { color: colors.textDim, fontSize: 11.5, marginTop: 3, fontFamily: fonts.body },
  empty: { color: colors.textDim, fontSize: 12.5, textAlign: 'center', marginTop: 40 },
}));
