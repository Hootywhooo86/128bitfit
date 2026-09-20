import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useDb } from '@/db/DatabaseProvider';
import type { WeightEntry } from '@/db/schema';
import { getAppSettings, type WeightUnit } from '@/db/settings-queries';
import {
  addWeightEntry,
  deleteWeightEntry,
  formatWeight,
  listRecentWeightEntries,
} from '@/db/weight-queries';
import { colors, spacing } from '@/lib/theme';

export default function WeightLogScreen() {
  const { ready } = useDb();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [units, setUnits] = useState<WeightUnit>('lb');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const [settings, list] = await Promise.all([
        getAppSettings(),
        listRecentWeightEntries(7),
      ]);
      setUnits(settings.units);
      setEntries(list);
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const onAdd = async () => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert('Invalid weight', 'Enter a positive number.');
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await addWeightEntry({
        value: n,
        unit: units,
        note: note.trim() || null,
      });
      setValue('');
      setNote('');
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const onDelete = (entry: WeightEntry) => {
    Alert.alert('Delete entry?', `Remove ${formatWeight(entry)}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteWeightEntry(entry.id);
          await refresh();
        },
      },
    ]);
  };

  if (!ready || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <Text style={styles.muted}>Last 7 weigh-ins. Units follow Settings ({units}).</Text>

      <Text style={styles.label}>Weight ({units})</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={setValue}
        keyboardType="decimal-pad"
        placeholder={units === 'kg' ? 'e.g. 82.5' : 'e.g. 180'}
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Note (optional)</Text>
      <TextInput
        style={styles.input}
        value={note}
        onChangeText={setNote}
        placeholder="Morning, post-cut…"
        placeholderTextColor={colors.textMuted}
      />

      <Pressable style={[styles.add, busy && { opacity: 0.6 }]} onPress={() => void onAdd()}>
        <Text style={styles.addText}>{busy ? 'Saving…' : 'Add weigh-in'}</Text>
      </Pressable>

      <Text style={styles.section}>Recent</Text>
      {entries.length === 0 ? (
        <Text style={styles.muted}>No weight entries yet.</Text>
      ) : (
        entries.map((e) => (
          <Pressable key={e.id} style={styles.row} onLongPress={() => onDelete(e)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.weight}>{formatWeight(e)}</Text>
              <Text style={styles.meta}>
                {new Date(e.loggedAt!).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
                {e.note ? ` · ${e.note}` : ''}
              </Text>
            </View>
            <Text style={styles.deleteHint}>hold to delete</Text>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muted: { color: colors.textMuted, lineHeight: 20, marginBottom: spacing.md },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
  },
  add: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  addText: { color: colors.chipActiveText, fontWeight: '900' },
  section: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  weight: { color: colors.accent, fontWeight: '800', fontSize: 18 },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  deleteHint: { color: colors.textMuted, fontSize: 10 },
});
