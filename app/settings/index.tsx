import { useFocusEffect, useRouter } from 'expo-router';
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
import {
  AI_PROVIDERS,
  getAiSettings,
  updateAiSettings,
  type AiSettings,
} from '@/db/ai-settings';
import { useDb } from '@/db/DatabaseProvider';
import {
  getAppSettings,
  updateAppSettings,
  type AppSettings,
  type WeightUnit,
} from '@/db/settings-queries';
import { PixelAvatar } from '@/components/PixelAvatar';
import type { AvatarConfig } from '@/lib/avatar';
import { DEFAULT_AVATAR } from '@/lib/avatar';
import { getProviderMeta, type AiProviderId } from '@/lib/ai-coach';
import { colors, spacing } from '@/lib/theme';

export default function SettingsScreen() {
  const router = useRouter();
  const { ready } = useDb();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [calorieTarget, setCalorieTarget] = useState('2200');
  const [proteinTarget, setProteinTarget] = useState('150');
  const [waterTarget, setWaterTarget] = useState('2500');
  const [units, setUnits] = useState<WeightUnit>('lb');
  const [showAvatarOnHome, setShowAvatarOnHome] = useState(true);
  const [avatar, setAvatar] = useState<AvatarConfig>({ ...DEFAULT_AVATAR });

  const [aiProvider, setAiProvider] = useState<AiProviderId>('anthropic');
  const [aiModel, setAiModel] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiKeyDraft, setAiKeyDraft] = useState('');
  const [aiHasKey, setAiHasKey] = useState(false);
  const [clearKeyConfirm, setClearKeyConfirm] = useState(false);

  const applyApp = (s: AppSettings) => {
    setDisplayName(s.displayName);
    setCalorieTarget(String(s.calorieTarget));
    setProteinTarget(String(s.proteinTarget));
    setWaterTarget(String(s.waterTargetMl));
    setUnits(s.units);
    setShowAvatarOnHome(s.showAvatarOnHome);
    setAvatar(s.avatar);
  };

  const applyAi = (s: AiSettings) => {
    setAiProvider(s.provider);
    setAiModel(s.model);
    setAiBaseUrl(s.baseUrl);
    setAiHasKey(s.hasKey);
    setAiKeyDraft('');
    setClearKeyConfirm(false);
  };

  const refresh = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const [app, ai] = await Promise.all([getAppSettings(), getAiSettings()]);
      applyApp(app);
      applyAi(ai);
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  const onSelectProvider = (id: AiProviderId) => {
    setAiProvider(id);
    const meta = getProviderMeta(id);
    setAiModel(meta.defaultModel);
    if (meta.defaultBaseUrl) setAiBaseUrl(meta.defaultBaseUrl);
    else if (!meta.needsBaseUrl) setAiBaseUrl('');
  };

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const nextApp = await updateAppSettings({
        displayName,
        calorieTarget: Number(calorieTarget) || 2200,
        proteinTarget: Number(proteinTarget) || 150,
        waterTargetMl: Number(waterTarget) || 2500,
        units,
        showAvatarOnHome,
      });
      applyApp(nextApp);

      const aiPatch: Parameters<typeof updateAiSettings>[0] = {
        provider: aiProvider,
        model: aiModel,
        baseUrl: aiBaseUrl,
      };
      if (aiKeyDraft.trim()) {
        aiPatch.apiKey = aiKeyDraft;
      }
      const nextAi = await updateAiSettings(aiPatch);
      applyAi(nextAi);

      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  const onClearKey = async () => {
    if (!clearKeyConfirm) {
      setClearKeyConfirm(true);
      return;
    }
    setSaving(true);
    try {
      const nextAi = await updateAiSettings({ apiKey: '' });
      applyAi(nextAi);
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

  const providerMeta = getProviderMeta(aiProvider);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <Text style={styles.muted}>
        Goals, character, and preferences persist in the local settings table. AI keys use
        Secure Store on device — never committed or logged.
      </Text>

      <Pressable style={styles.charCard} onPress={() => router.push('/settings/export')}>
        <View style={{ flex: 1 }}>
          <Text style={styles.aiTitle}>Export data</Text>
          <Text style={styles.muted}>Download everything as CSV and JSON →</Text>
        </View>
      </Pressable>

      <Pressable style={styles.charCard} onPress={() => router.push('/settings/character')}>
        <PixelAvatar config={avatar} pose="idle" size={56} />
        <View style={{ flex: 1 }}>
          <Text style={styles.aiTitle}>Character</Text>
          <Text style={styles.muted}>Edit your pixel avatar →</Text>
        </View>
      </Pressable>

      <Text style={styles.label}>Show avatar on Home</Text>
      <View style={styles.unitRow}>
        {([true, false] as const).map((v) => (
          <Pressable
            key={String(v)}
            style={[styles.unitChip, showAvatarOnHome === v && styles.unitChipOn]}
            onPress={() => setShowAvatarOnHome(v)}
          >
            <Text style={[styles.unitText, showAvatarOnHome === v && styles.unitTextOn]}>
              {v ? 'Show' : 'Hide'}
            </Text>
          </Pressable>
        ))}
      </View>

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

      <View style={styles.aiCard}>
        <Text style={styles.aiTitle}>AI Coach — Bring your own key</Text>
        <Text style={styles.muted}>
          128BIT FIT does not sell AI subscriptions. Paste a key from Anthropic, OpenAI, Gemini,
          OpenRouter, or point at a custom OpenAI-compatible endpoint (e.g. Ollama). Your key stays
          on this device.
        </Text>

        <Text style={styles.label}>Provider</Text>
        <View style={styles.providerWrap}>
          {AI_PROVIDERS.map((p) => (
            <Pressable
              key={p.id}
              style={[styles.providerChip, aiProvider === p.id && styles.providerChipOn]}
              onPress={() => onSelectProvider(p.id)}
            >
              <Text
                style={[styles.providerText, aiProvider === p.id && styles.providerTextOn]}
              >
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>{providerMeta.hint}</Text>

        <Text style={styles.label}>Model</Text>
        <TextInput
          style={styles.input}
          value={aiModel}
          onChangeText={setAiModel}
          placeholder={providerMeta.defaultModel}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {(providerMeta.needsBaseUrl ||
          aiProvider === 'openai' ||
          aiProvider === 'openrouter' ||
          aiProvider === 'custom') && (
          <>
            <Text style={styles.label}>
              Base URL{providerMeta.needsBaseUrl ? ' (required)' : ' (optional override)'}
            </Text>
            <TextInput
              style={styles.input}
              value={aiBaseUrl}
              onChangeText={setAiBaseUrl}
              placeholder={providerMeta.defaultBaseUrl ?? 'https://…'}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </>
        )}

        <Text style={styles.label}>API key</Text>
        <TextInput
          style={styles.input}
          value={aiKeyDraft}
          onChangeText={setAiKeyDraft}
          placeholder={aiHasKey ? '••••••••  (leave blank to keep)' : 'Paste key — never shared'}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          textContentType="password"
        />
        <Text style={styles.hint}>
          Status: {aiHasKey ? 'Key saved on device' : 'No key configured — Coach stays in stub mode'}
        </Text>

        {aiHasKey ? (
          <Pressable
            style={[styles.clearKey, clearKeyConfirm && styles.clearKeyConfirm]}
            onPress={() => void onClearKey()}
          >
            <Text style={styles.clearKeyText}>
              {clearKeyConfirm ? 'Tap again to clear key' : 'Clear saved API key'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable style={[styles.save, saving && { opacity: 0.6 }]} onPress={() => void onSave()}>
        <Text style={styles.saveText}>{saving ? 'Saving…' : savedFlash ? 'Saved' : 'Save'}</Text>
      </Pressable>


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
  aiTitle: { color: colors.text, fontWeight: '800', marginBottom: 6, fontSize: 16 },
  charCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.md,
  },
  providerWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  providerChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  providerChipOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  providerText: { color: colors.textMuted, fontWeight: '700', fontSize: 12 },
  providerTextOn: { color: colors.accent },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: 8, lineHeight: 16 },
  clearKey: {
    marginTop: spacing.md,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  clearKeyConfirm: { borderColor: colors.danger },
  clearKeyText: { color: colors.danger, fontWeight: '700', fontSize: 13 },
});
