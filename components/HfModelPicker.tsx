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
import { colors, fonts, radius, spacing } from '@/lib/theme';

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
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [models, setModels] = useState<HfModel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
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

  const shown = models ? filterHfModels(models, query) : [];

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
                <Pressable style={s.row} onPress={() => onPick(item.id)}>
                  <Text style={s.rowId} numberOfLines={1}>
                    {item.id}
                  </Text>
                  {item.provider ? <Text style={s.rowProv}>{item.provider}</Text> : null}
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

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, padding: spacing.md, paddingTop: 48 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: fonts.pixel, fontSize: 10, color: colors.text, letterSpacing: 1 },
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
  rowProv: { color: colors.textDim, fontSize: 11.5, marginTop: 3, fontFamily: fonts.body },
});
