import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
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
  getCalorieProfile,
  previewCalorieTarget,
  updateAppSettings,
  type AppSettings,
  type WeightUnit,
} from '@/db/settings-queries';
import {
  getProviderMeta,
  providerCanSearchWeb,
  webSearchUnavailableReason,
  type AiProviderId,
} from '@/lib/ai-coach';
import { explainFloor } from '@/lib/calorie-floor';
import { HF_VISION_FAMILIES } from '@/lib/ai-fallback';
import { AiKeyStoreError } from '@/lib/ai-secure';
import {
  ACTIVITY_LEVELS,
  DEFAULT_ACTIVITY,
  DEFAULT_GOAL,
  GOALS,
  basalMetabolicRate,
  suggestCalorieTarget,
  totalDailyEnergy,
  type ActivityLevel,
  type CalorieProfile,
  type Goal,
} from '@/lib/body';
import { colors, spacing, themedStyles } from '@/lib/theme';
import { HfModelPicker } from '@/components/HfModelPicker';
import { Screen } from '@/components/ui';
import { accentName } from '@/lib/accent';
import { UpdateCard } from '@/components/UpdateCard';
import { REPDB } from 'repdb-generated';
import { REPDB_CREDIT, REPDB_URL } from '@/lib/exercise-images';

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
  const [keepAwake, setKeepAwake] = useState(true);
  const [activity, setActivity] = useState<ActivityLevel>(DEFAULT_ACTIVITY);
  const [goal, setGoal] = useState<Goal>(DEFAULT_GOAL);
  const [profile, setProfile] = useState<CalorieProfile | null>(null);

  const [aiProvider, setAiProvider] = useState<AiProviderId>('anthropic');
  const [aiModel, setAiModel] = useState('');
  /** null = typed by hand, so nothing is known about its image support. */
  const [aiModelVision, setAiModelVision] = useState<boolean | null>(null);
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [aiKeyDraft, setAiKeyDraft] = useState('');
  const [aiHasKey, setAiHasKey] = useState(false);
  const [aiWebSearch, setAiWebSearch] = useState(true);
  const [clearKeyConfirm, setClearKeyConfirm] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const applyApp = (s: AppSettings) => {
    setDisplayName(s.displayName);
    setCalorieTarget(String(s.calorieTarget));
    setProteinTarget(String(s.proteinTarget));
    setWaterTarget(String(s.waterTargetMl));
    setUnits(s.units);
    setKeepAwake(s.keepAwake);
    setActivity(s.activity);
    setGoal(s.goal);
  };

  const applyAi = (s: AiSettings) => {
    setAiProvider(s.provider);
    setAiModelVision(s.modelVision);
    setAiModel(s.model);
    setAiBaseUrl(s.baseUrl);
    setAiHasKey(s.hasKey);
    setAiWebSearch(s.webSearch);
    setAiKeyDraft('');
    setClearKeyConfirm(false);
  };

  const refresh = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const [app, ai, prof] = await Promise.all([
        getAppSettings(),
        getAiSettings(),
        getCalorieProfile(),
      ]);
      setProfile(prof);
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
    // A different provider's default model. What the old one could see says
    // nothing about this one, so forget it rather than carry it over.
    setAiModelVision(null);
    if (meta.defaultBaseUrl) setAiBaseUrl(meta.defaultBaseUrl);
    else if (!meta.needsBaseUrl) setAiBaseUrl('');
  };

  const onSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // The floor is enforced in updateAppSettings regardless; this is only so
      // the change is explained rather than applied silently.
      const floorCheck = await previewCalorieTarget(Number(calorieTarget) || 2200);

      const nextApp = await updateAppSettings({
        displayName,
        calorieTarget: Number(calorieTarget) || 2200,
        proteinTarget: Number(proteinTarget) || 150,
        waterTargetMl: Number(waterTarget) || 2500,
        units,
        keepAwake,
        activity,
        goal,
      });
      applyApp(nextApp);
      if (floorCheck.clamped) {
        setCalorieTarget(String(floorCheck.value));
        Alert.alert('Calorie target adjusted', explainFloor(floorCheck));
      }

      const aiPatch: Parameters<typeof updateAiSettings>[0] = {
        provider: aiProvider,
        model: aiModel,
        baseUrl: aiBaseUrl,
        modelVision: aiModelVision,
        webSearch: aiWebSearch,
      };
      if (aiKeyDraft.trim()) {
        aiPatch.apiKey = aiKeyDraft;
      }
      let keyWarning: string | null = null;
      try {
        const nextAi = await updateAiSettings(aiPatch);
        applyAi(nextAi);
      } catch (e) {
        if (e instanceof AiKeyStoreError) {
          // Everything but the key is saved by this point. Say what did not
          // stick rather than clearing the field and looking like it worked.
          keyWarning = e.message;
          applyAi(await getAiSettings());
        } else {
          throw e;
        }
      }
      if (keyWarning) {
        Alert.alert('Key not saved', `${keyWarning}\n\nPaste it again, or use it for this session only.`);
        return;
      }

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
    <Screen section="Settings" back>
      <Text style={styles.muted}>
        Goals and preferences persist in the local settings table. AI keys use
        Secure Store on device — never committed or logged.
      </Text>

      <Pressable style={styles.charCard} onPress={() => router.push('/settings/privacy')}>
        <View style={{ flex: 1 }}>
          <Text style={styles.aiTitle}>Privacy & health data</Text>
          <Text style={styles.muted}>What is stored, what leaves the device →</Text>
        </View>
      </Pressable>

      <Pressable style={styles.charCard} onPress={() => router.push('/settings/theme')}>
        <View style={[styles.themeDot, { backgroundColor: colors.accent }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.aiTitle}>Theme colour</Text>
          <Text style={styles.muted}>{accentName(colors.accent)} · free, all of them →</Text>
        </View>
      </Pressable>

      <Pressable style={styles.charCard} onPress={() => router.push('/settings/map')}>
        <View style={{ flex: 1 }}>
          <Text style={styles.aiTitle}>Map</Text>
          <Text style={styles.muted}>Dark or light, km or miles, route colours →</Text>
        </View>
      </Pressable>

      <Pressable style={styles.charCard} onPress={() => router.push('/settings/health')}>
        <View style={{ flex: 1 }}>
          <Text style={styles.aiTitle}>Health Connect</Text>
          <Text style={styles.muted}>Check what it is actually reporting →</Text>
        </View>
      </Pressable>

      <Pressable style={styles.charCard} onPress={() => router.push('/settings/import')}>
        <View style={{ flex: 1 }}>
          <Text style={styles.aiTitle}>Import exercises</Text>
          <Text style={styles.muted}>From Hevy, a CSV, or a JSON export →</Text>
        </View>
      </Pressable>

      <Pressable style={styles.charCard} onPress={() => router.push('/settings/export')}>
        <View style={{ flex: 1 }}>
          <Text style={styles.aiTitle}>Export data</Text>
          <Text style={styles.muted}>Download everything as CSV and JSON →</Text>
        </View>
      </Pressable>

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

      <Text style={styles.label}>How active are you?</Text>
      <Text style={styles.muted}>
        Outside training. This is the multiplier on your maintenance calories, and it was
        fixed at &quot;Light&quot; before — worth about 1,200 kcal a day between the ends of
        the scale.
      </Text>
      {ACTIVITY_LEVELS.map((l) => (
        <Pressable
          key={l.id}
          style={[styles.optRow, activity === l.id && styles.optRowOn]}
          onPress={() => setActivity(l.id)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.optName}>{l.label}</Text>
            <Text style={styles.optDetail}>{l.detail}</Text>
          </View>
          <Text style={styles.optFactor}>×{l.factor}</Text>
        </Pressable>
      ))}

      <Text style={styles.label}>What are you aiming for?</Text>
      {GOALS.map((g) => (
        <Pressable
          key={g.id}
          style={[styles.optRow, goal === g.id && styles.optRowOn]}
          onPress={() => setGoal(g.id)}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.optName}>{g.label}</Text>
            <Text style={styles.optDetail}>{g.detail}</Text>
          </View>
        </Pressable>
      ))}

      <MaintenanceNote profile={profile} activity={activity} goal={goal} />

      <Text style={styles.label}>During a workout</Text>
      <Pressable
        style={styles.toggleRow}
        onPress={() => setKeepAwake((v) => !v)}
        accessibilityRole="switch"
        accessibilityState={{ checked: keepAwake }}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleTitle}>Keep the screen on</Text>
          <Text style={styles.muted}>
            Stops the phone sleeping between sets while a session is running, so logging one does
            not start with unlocking it. Released the moment the workout ends.
          </Text>
        </View>
        <View style={[styles.switch, keepAwake && styles.switchOn]}>
          <View style={[styles.knob, keepAwake && styles.knobOn]} />
        </View>
      </Pressable>

      <View style={styles.aiCard}>
        <Text style={styles.aiTitle}>AI Coach — Bring your own key</Text>
        <Text style={styles.muted}>
          128BIT FIT does not sell AI subscriptions. Paste a key from Anthropic, OpenAI, Gemini,
          OpenRouter, Groq, or point at a custom OpenAI-compatible endpoint (e.g. Ollama). Your key stays
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

        <Pressable
          style={[styles.toggleRow, { marginTop: spacing.md }]}
          onPress={() => setAiWebSearch((v) => !v)}
          accessibilityRole="switch"
          accessibilityState={{ checked: aiWebSearch }}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleTitle}>Look things up online</Text>
            <Text style={[styles.muted, { marginBottom: 0 }]}>
              {providerCanSearchWeb(aiProvider, aiModel || providerMeta.defaultModel)
                ? `Lets the coach, meal photos and recipe links search the web for real figures instead of guessing. Describing a meal has its own Estimate and Look up online buttons either way. Searches can cost extra on your key.`
                : webSearchUnavailableReason(aiProvider, aiModel || providerMeta.defaultModel)}
            </Text>
          </View>
          <View style={[styles.switch, aiWebSearch && styles.switchOn]}>
            <View style={[styles.knob, aiWebSearch && styles.knobOn]} />
          </View>
        </Pressable>

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
        {aiProvider === 'huggingface' ? (
          <>
            <Pressable style={styles.browseBtn} onPress={() => setPickerOpen(true)}>
              <Text style={styles.browseText}>Browse models →</Text>
            </Pressable>
            <Text style={styles.muted}>
              Photos rotate automatically when a model runs out of credit or its provider is
              busy: {HF_VISION_FAMILIES.map((f) => f.label).join(' → ')}. Your token works for
              all of them, so nothing else is needed. A key that is rejected stops there rather
              than retrying five times.
            </Text>
          </>
        ) : null}
        <HfModelPicker
          visible={pickerOpen}
          apiKey={aiKeyDraft.trim() || null}
          onPick={(m) => {
            setAiModel(m.id);
            // Recorded now, while the router's answer is in hand — a photo gets
            // taken where there may be no signal to ask again.
            setAiModelVision(m.vision);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
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

      <UpdateCard />

      <View style={styles.aiCard}>
        <Text style={styles.aiTitle}>About / data licenses</Text>
        <Text style={styles.muted}>
          USDA FoodData Central powers the offline food database. Barcode products may also come
          from Open Food Facts and are available under the Open Database License (ODbL). Cached
          barcode results stay on-device only — no bulk OFF import.
        </Text>
        <Text style={styles.muted}>
          Exercises: free-exercise-db (public domain).
          {REPDB.exercises.length > 0 ? ` ${REPDB.exercises.length} more, with pictures:` : ''}
        </Text>
        {REPDB.exercises.length > 0 ? (
          <Pressable onPress={() => void Linking.openURL(REPDB_URL)}>
            <Text style={[styles.muted, { textDecorationLine: 'underline' }]}>{REPDB_CREDIT}</Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

/**
 * What these two choices actually do to the numbers.
 *
 * Shown live, because "×1.55" means nothing on its own and the point of the
 * setting is the calorie figure at the end of it. Renders nothing when the
 * profile is too incomplete to compute one — a maintenance figure invented
 * from a missing height and age would be exactly the made-up measurement the
 * app exists to avoid.
 */
function MaintenanceNote({
  profile,
  activity,
  goal,
}: {
  profile: CalorieProfile | null;
  activity: ActivityLevel;
  goal: Goal;
}) {
  if (!profile) return null;
  const withActivity = { ...profile, activity };
  const bmr = basalMetabolicRate(withActivity);
  const tdee = totalDailyEnergy(withActivity);
  if (bmr == null || tdee == null) {
    return (
      <Text style={styles.muted}>
        Add your height, birthday and a weigh-in and this will show what you burn in a day.
      </Text>
    );
  }
  const target = suggestCalorieTarget(withActivity, goal);
  return (
    <View style={styles.calcCard}>
      <Text style={styles.calcRow}>
        Resting burn <Text style={styles.calcNum}>{Math.round(bmr).toLocaleString()}</Text> kcal
      </Text>
      <Text style={styles.calcRow}>
        Maintenance <Text style={styles.calcNum}>{Math.round(tdee).toLocaleString()}</Text> kcal
      </Text>
      <Text style={styles.calcRow}>
        Suggested target <Text style={styles.calcNum}>{target.toLocaleString()}</Text> kcal
      </Text>
      <Text style={styles.optDetail}>
        An estimate from height, weight, age and how active you say you are — not a
        measurement. Set the target field above to this if you want it. Whatever you enter,
        it is never allowed below your resting burn.
      </Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  themeDot: { width: 22, height: 22, borderRadius: 11 },
  browseBtn: { paddingVertical: 10 },
  browseText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
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
  unitChipOn: { borderColor: colors.accent, backgroundColor: colors.track },
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    marginBottom: 6,
  },
  optRowOn: { borderColor: colors.accent, backgroundColor: colors.track },
  optName: { color: colors.text, fontWeight: '700', fontSize: 14 },
  optDetail: { color: colors.textMuted, fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  optFactor: { color: colors.textMuted, fontSize: 12.5, fontWeight: '700' },
  calcCard: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    marginTop: spacing.sm,
    gap: 4,
  },
  calcRow: { color: colors.textMuted, fontSize: 13 },
  calcNum: { color: colors.text, fontWeight: '800', fontSize: 15 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
  },
  toggleTitle: { color: colors.text, fontWeight: '700', fontSize: 14, marginBottom: 3 },
  switch: {
    width: 46,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.track,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    padding: 2,
  },
  switchOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  knob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.textMuted,
  },
  knobOn: { backgroundColor: colors.onAccent, alignSelf: 'flex-end' },
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
  providerChipOn: { borderColor: colors.accent, backgroundColor: colors.track },
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
}));
