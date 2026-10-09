import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { filterHfModels, listHfModels, type HfModel } from '@/lib/hf-models';
import { colors, fonts, radius, spacing, themedStyles } from '@/lib/theme';

/**
 * Browse the models Hugging Face's router can actually serve.
 *
 * Not a hardcoded list: Hugging Face hosts hundreds of thousands of models and
 * the servable set changes weekly, so the router is asked at open time. The
 * model field behind this stays typeable, so failing to load the list costs the
 * user a convenience, not the feature.
 */
export function HfModelPicker({
  visible,
  apiKey,
  onPick,
  onClose,
}: {
  visible: boolean;
  apiKey: string | null;
  /** The model's image support travels with it, so it can be recorded. */
  onPick: (model: HfModel) => void;
  onClose: () => void;
}) {
  const [models, setModels] = useState<HfModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [visionOnly, setVisionOnly] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads data when the screen opens; the state it sets is the result of that read
    setModels(null);
    setError(null);
    void (async () => {
      const r = await listHfModels(apiKey);
      if (cancelled) return;
      if (r.status === 'ok') setModels(r.models);
      else setError(r.message);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, apiKey]);

  const shown = models ? filterHfModels(models, query, visionOnly) : [];
  const visionCount = models ? models.filter((m) => m.vision).length : 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.wrap}>
        <View style={s.head}>
          <Text style={s.title}>HUGGING FACE MODELS</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={s.close}>✕</Text>
          </Pressable>
        </View>

        <TextInput
          style={s.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search — llama, qwen, 70b…"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {/*
          About a third of what the router serves takes images. Someone who came
          here to photograph a recipe needs to find those, and someone who did
          not should not have the list narrowed on them — so it is a filter, off
          by default, with the count shown.
        */}
        {visionCount > 0 ? (
          <Pressable
            style={[s.filter, visionOnly && s.filterOn]}
            onPress={() => setVisionOnly((v) => !v)}
          >
            <Text style={[s.filterText, visionOnly && s.filterTextOn]}>
              ◉ Can read photos ({visionCount})
            </Text>
          </Pressable>
        ) : null}

        {models == null && !error ? (
          <View style={s.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : error ? (
          <View style={s.center}>
            <Text style={s.err}>{error}</Text>
            <Text style={s.hint}>You can still type a model id by hand.</Text>
          </View>
        ) : (
          <>
            <Text style={s.count}>
              {shown.length} of {models?.length ?? 0}
            </Text>
            <FlatList
              data={shown}
              keyExtractor={(m) => m.id}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable style={s.row} onPress={() => onPick(item)}>
                  <Text style={s.rowId} numberOfLines={1}>
                    {item.id}
                  </Text>
                  <View style={s.rowMeta}>
                    {item.provider ? <Text style={s.rowProv}>{item.provider}</Text> : null}
                    {item.vision ? <Text style={s.rowVision}>◉ reads photos</Text> : null}
                  </View>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={s.hint}>Nothing matches that search.</Text>}
            />
          </>
        )}
      </View>
    </Modal>
  );
}

const s = themedStyles(() => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: spacing.md, paddingTop: 48 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.pixel, fontSize: 7, color: colors.text, letterSpacing: 0.7 },
  close: { color: colors.textMuted, fontSize: 22 },
  search: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    fontFamily: fonts.body,
  },
  center: { paddingVertical: 60, alignItems: 'center', gap: 8 },
  err: { color: colors.danger, fontSize: 13, textAlign: 'center', fontFamily: fonts.body },
  hint: { color: colors.textDim, fontSize: 12.5, textAlign: 'center', fontFamily: fonts.body },
  count: { color: colors.textDim, fontSize: 11, marginBottom: 6, fontFamily: fonts.body },
  row: {
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowId: { color: colors.text, fontSize: 14, fontFamily: fonts.body },
  rowMeta: { flexDirection: 'row', gap: spacing.sm, marginTop: 3 },
  rowProv: { color: colors.textDim, fontSize: 11.5, fontFamily: fonts.body },
  rowVision: { color: colors.textMuted, fontSize: 11.5, fontFamily: fonts.body },
  filter: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: spacing.sm,
  },
  filterOn: { borderColor: colors.accent, backgroundColor: colors.track },
  filterText: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.body },
  filterTextOn: { color: colors.text, fontWeight: '700' },
}));
