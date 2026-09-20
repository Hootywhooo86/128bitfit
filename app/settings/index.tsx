import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useDb } from '@/db/DatabaseProvider';
import {
  getAppSettings,
  updateAppSettings,
  type AppSettings,
  type WeightUnit,
} from '@/db/settings-queries';
import { colors, spacing } from '@/lib/theme';

export default function SettingsScreen() {
  const { ready } = useDb();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [calorieTarget, setCalorieTarget] = useState('2200');
  const [proteinTarget, setProteinTarget] = useState('150');
  const [waterTarget, setWaterTarget] = useState('2500');
  const [units, setUnits] = useState<WeightUnit>('lb');

  const apply = (s: AppSettings) => {
    setDisplayName(s.displayName);
    setCalorieTarget(String(s.calorieTarget));
    setProteinTarget(String(s.proteinTarget));
    setWaterTarget(String(s.waterTargetMl));
    setUnits(s.units);
  };

  const refresh = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      apply(await getAppSettings());
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const next = await updateAppSettings({
        displayName,
        calorieTarget: Number(calorieTarget) || 2200,
        proteinTarget: Number(proteinTarget) || 150,
        waterTargetMl: Number(waterTarget) || 2500,
        units,
      });
      apply(next);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } finally {
      setSaving(false);
    }
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
      <Text style={styles.muted}>
        Goals and preferences persist in the local settings table. AI provider keys are out of
        scope for this slice.
      </Text>

      <Text style={styles.label}>Display name</Text>
      <TextInput
        style={styles.input}
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Athlete"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="words"
      />

      <Text style={styles.label}>Calorie target (kcal)</Text>
      <TextInput
        style={styles.input}
        value={calorieTarget}
        onChangeText={setCalorieTarget}
        keyboardType="numeric"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Protein target (g)</Text>
      <TextInput
        style={styles.input}
        value={proteinTarget}
        onChangeText={setProteinTarget}
        keyboardType="numeric"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Water target (ml)</Text>
      <TextInput
        style={styles.input}
        value={waterTarget}
        onChangeText={setWaterTarget}
        keyboardType="numeric"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={styles.label}>Weight units</Text>
      <View style={styles.unitRow}>
        {(['lb', 'kg'] as WeightUnit[]).map((u) => (
          <Pressable
            key={u}
            style={[styles.unitChip, units === u && styles.unitChipOn]}
            onPress={() => setUnits(u)}
          >
            <Text style={[styles.unitText, units === u && styles.unitTextOn]}>{u}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={[styles.save, saving && { opacity: 0.6 }]} onPress={() => void onSave()}>
        <Text style={styles.saveText}>{saving ? 'Saving…' : savedFlash ? 'Saved' : 'Save'}</Text>
      </Pressable>

      <View style={styles.aiCard}>
        <Text style={styles.aiTitle}>AI provider</Text>
        <Text style={styles.muted}>
          Connect Anthropic / OpenAI in a later slice. Coach screens already assemble local
          context for prompt wiring.
        </Text>
      </View>

      <View style={styles.aiCard}>
        <Text style={styles.aiTitle}>About / data licenses</Text>
        <Text style={styles.muted}>
          USDA FoodData Central powers the offline food database. Barcode products may also come
          from Open Food Facts and are available under the Open Database License (ODbL). Cached
          barcode results stay on-device only — no bulk OFF import.
        </Text>
      </View>
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
    letterSpacing: 0.5,
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
  unitRow: { flexDirection: 'row', gap: spacing.sm },
  unitChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  unitChipOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  unitText: { color: colors.textMuted, fontWeight: '800' },
  unitTextOn: { color: colors.accent },
  save: {
    marginTop: spacing.lg,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  saveText: { color: colors.chipActiveText, fontWeight: '900', fontSize: 16 },
  aiCard: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  aiTitle: { color: colors.text, fontWeight: '800', marginBottom: 6 },
});
