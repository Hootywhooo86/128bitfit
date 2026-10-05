import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getAiSettings, updateAiSettings, type AiSettings } from '@/db/ai-settings';
import { useDb } from '@/db/DatabaseProvider';
import {
  getAppSettings,
  getCalorieProfile,
  previewCalorieTarget,
  updateAppSettings,
  type AppSettings,
  type WeightUnit,
} from '@/db/settings-queries';
import { explainFloor } from '@/lib/calorie-floor';
import { AiKeyStoreError } from '@/lib/ai-secure';
import {
  ACTIVITY_LEVELS,
  DEFAULT_ACTIVITY,
  DEFAULT_GOAL,
  GOALS,
  type ActivityLevel,
  type CalorieProfile,
  type Goal,
} from '@/lib/body';
import { baseUrlProblem } from '@/lib/api-key';
import { colors } from '@/lib/theme';
import { Screen } from '@/components/ui';
import { UpdateCard } from '@/components/UpdateCard';
import { ToggleRow } from '@/components/ToggleRow';
import { breakdownPromptOn, setBreakdownPrompt } from '@/lib/ai-breakdown';
import { AboutSection } from '@/components/settings/AboutSection';
import { AiCoachCard, type AiDraft } from '@/components/settings/AiCoachCard';
import { MaintenanceNote } from '@/components/settings/MaintenanceNote';
import { SettingsLinks } from '@/components/settings/SettingsLinks';
import { settingsStyles as styles } from '@/components/settings/settings-styles';

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
  const [keepAwake, setKeepAwake] = useState(true);
  const [breakdownAsk, setBreakdownAsk] = useState(true);
  useEffect(() => {
    void breakdownPromptOn().then(setBreakdownAsk);
  }, []);
  const [activity, setActivity] = useState<ActivityLevel>(DEFAULT_ACTIVITY);
  const [goal, setGoal] = useState<Goal>(DEFAULT_GOAL);
  const [profile, setProfile] = useState<CalorieProfile | null>(null);

  const [ai, setAi] = useState<AiDraft>({
    provider: 'anthropic',
    model: '',
    modelVision: null,
    baseUrl: '',
    keyDraft: '',
    webSearch: true,
  });
  const [aiHasKey, setAiHasKey] = useState(false);
  const [clearKeyConfirm, setClearKeyConfirm] = useState(false);

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
    setAi({
      provider: s.provider,
      model: s.model,
      modelVision: s.modelVision,
      baseUrl: s.baseUrl,
      keyDraft: '',
      webSearch: s.webSearch,
    });
    setAiHasKey(s.hasKey);
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

  const onSave = async () => {
    if (saving) return;
    // Before anything is written: an address that can never connect should
    // be caught here, not on the first question to the coach.
    const urlProblem = baseUrlProblem(ai.baseUrl);
    if (urlProblem) {
      Alert.alert('Base URL not saved', urlProblem);
      return;
    }
    setSaving(true);
    try {
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
      // Checked after the save, against the profile this save just wrote
      // (activity included) — the floor the target was actually held to.
      const floorCheck = await previewCalorieTarget(Number(calorieTarget) || 2200);
      if (floorCheck.clamped) {
        setCalorieTarget(String(floorCheck.value));
        Alert.alert('Calorie target adjusted', explainFloor(floorCheck));
      }

      const aiPatch: Parameters<typeof updateAiSettings>[0] = {
        provider: ai.provider,
        model: ai.model,
        baseUrl: ai.baseUrl,
        modelVision: ai.modelVision,
        webSearch: ai.webSearch,
      };
      if (ai.keyDraft.trim()) {
        aiPatch.apiKey = ai.keyDraft;
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
    } catch (e) {
      Alert.alert('Settings not saved', e instanceof Error ? e.message : String(e));
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

  return (
    <Screen section="Settings" back>
      <Text style={styles.muted}>
        Everything here stays on this phone. An AI key is kept in the phone&apos;s secure
        storage and only ever sent to the AI provider you pick.
      </Text>

      <SettingsLinks />

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

      <ToggleRow
        name="Offer an AI breakdown when I finish"
        sub="Only asked when an AI key is set up below"
        value={breakdownAsk}
        onChange={(v) => {
          setBreakdownAsk(v);
          void setBreakdownPrompt(v);
        }}
      />

      <AiCoachCard
        draft={ai}
        onChange={(patch) => setAi((prev) => ({ ...prev, ...patch }))}
        hasKey={aiHasKey}
        clearKeyConfirm={clearKeyConfirm}
        onClearKey={() => void onClearKey()}
      />

      <Pressable style={[styles.save, saving && { opacity: 0.6 }]} onPress={() => void onSave()}>
        <Text style={styles.saveText}>{saving ? 'Saving…' : savedFlash ? 'Saved' : 'Save'}</Text>
      </Pressable>

      <UpdateCard />

      <AboutSection />
    </Screen>
  );
}
