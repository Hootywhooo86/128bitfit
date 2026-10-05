import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { HfModelPicker } from '@/components/HfModelPicker';
import { AI_PROVIDERS } from '@/db/ai-settings';
import {
  getProviderMeta,
  providerCanSearchWeb,
  webSearchUnavailableReason,
  type AiProviderId,
} from '@/lib/ai-coach';
import { HF_VISION_FAMILIES } from '@/lib/ai-fallback';
import { colors, spacing } from '@/lib/theme';
import { settingsStyles as styles } from './settings-styles';

/** The AI fields as typed, before Save writes them. */
export type AiDraft = {
  provider: AiProviderId;
  model: string;
  /** null = typed by hand, so nothing is known about its image support. */
  modelVision: boolean | null;
  baseUrl: string;
  /** A key being pasted. Blank keeps the saved one. */
  keyDraft: string;
  webSearch: boolean;
};

/** What picking a provider changes: its default model, and its address if it has one. */
export function providerPatch(id: AiProviderId, currentBaseUrl: string): Partial<AiDraft> {
  const meta = getProviderMeta(id);
  return {
    provider: id,
    model: meta.defaultModel,
    // A different provider's default model. What the old one could see says
    // nothing about this one, so forget it rather than carry it over.
    modelVision: null,
    baseUrl: meta.defaultBaseUrl ? meta.defaultBaseUrl : !meta.needsBaseUrl ? '' : currentBaseUrl,
  };
}

/** Bring-your-own-key: provider, model, address and key. Saved by the screen's Save. */
export function AiCoachCard({
  draft,
  onChange,
  hasKey,
  clearKeyConfirm,
  onClearKey,
}: {
  draft: AiDraft;
  onChange: (patch: Partial<AiDraft>) => void;
  hasKey: boolean;
  clearKeyConfirm: boolean;
  onClearKey: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const providerMeta = getProviderMeta(draft.provider);
  return (
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
            style={[styles.providerChip, draft.provider === p.id && styles.providerChipOn]}
            onPress={() => onChange(providerPatch(p.id, draft.baseUrl))}
          >
            <Text
              style={[styles.providerText, draft.provider === p.id && styles.providerTextOn]}
            >
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>{providerMeta.hint}</Text>

      <Pressable
        style={[styles.toggleRow, { marginTop: spacing.md }]}
        onPress={() => onChange({ webSearch: !draft.webSearch })}
        accessibilityRole="switch"
        accessibilityState={{ checked: draft.webSearch }}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleTitle}>Look things up online</Text>
          <Text style={[styles.muted, { marginBottom: 0 }]}>
            {providerCanSearchWeb(draft.provider, draft.model || providerMeta.defaultModel)
              ? `Lets the coach, meal photos and recipe links search the web for real figures instead of guessing. Describing a meal has its own Estimate and Look up online buttons either way. Searches can cost extra on your key.`
              : webSearchUnavailableReason(draft.provider, draft.model || providerMeta.defaultModel)}
          </Text>
        </View>
        <View style={[styles.switch, draft.webSearch && styles.switchOn]}>
          <View style={[styles.knob, draft.webSearch && styles.knobOn]} />
        </View>
      </Pressable>

      <Text style={styles.label}>Model</Text>
      <TextInput
        style={styles.input}
        value={draft.model}
        onChangeText={(model) => onChange({ model })}
        placeholder={providerMeta.defaultModel}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {draft.provider === 'huggingface' ? (
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
        apiKey={draft.keyDraft.trim() || null}
        onPick={(m) => {
          // Recorded now, while the router's answer is in hand — a photo gets
          // taken where there may be no signal to ask again.
          onChange({ model: m.id, modelVision: m.vision });
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />

      {(providerMeta.needsBaseUrl ||
        draft.provider === 'openai' ||
        draft.provider === 'openrouter' ||
        draft.provider === 'custom') && (
        <>
          <Text style={styles.label}>
            Base URL{providerMeta.needsBaseUrl ? ' (required)' : ' (optional override)'}
          </Text>
          <TextInput
            style={styles.input}
            value={draft.baseUrl}
            onChangeText={(baseUrl) => onChange({ baseUrl })}
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
        value={draft.keyDraft}
        onChangeText={(keyDraft) => onChange({ keyDraft })}
        placeholder={hasKey ? '••••••••  (leave blank to keep)' : 'Paste key — never shared'}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        textContentType="password"
      />
      <Text style={styles.hint}>
        Status: {hasKey ? 'Key saved on device' : 'No key yet — the coach needs one to answer'}
      </Text>

      {hasKey ? (
        <Pressable
          style={[styles.clearKey, clearKeyConfirm && styles.clearKeyConfirm]}
          onPress={onClearKey}
        >
          <Text style={styles.clearKeyText}>
            {clearKeyConfirm ? 'Tap again to clear key' : 'Clear saved API key'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
