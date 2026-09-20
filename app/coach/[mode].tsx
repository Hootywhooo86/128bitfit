import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getAiRuntimeConfig } from '@/db/ai-settings';
import {
  appendCoachMessage,
  createCoachThread,
} from '@/db/coach-chat';
import {
  buildCoachContext,
  coachModeLabel,
  COACH_PLACEHOLDER_REPLY,
  type CoachContextSummary,
  type CoachMode,
} from '@/db/coach-context';
import { useDb } from '@/db/DatabaseProvider';
import {
  AiCoachError,
  buildSystemPrompt,
  coachChat,
  defaultUserPromptForMode,
} from '@/lib/ai-coach';
import { colors, spacing } from '@/lib/theme';

function isCoachMode(v: string): v is CoachMode {
  return v === 'debrief' || v === 'ask' || v === 'checkin';
}

export default function CoachSessionScreen() {
  const router = useRouter();
  const { mode: modeParam } = useLocalSearchParams<{ mode: string }>();
  const raw = typeof modeParam === 'string' ? modeParam : Array.isArray(modeParam) ? modeParam[0] : '';
  const mode: CoachMode = isCoachMode(raw) ? raw : 'ask';
  const { ready } = useDb();

  const [ctx, setCtx] = useState<CoachContextSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState(false);
  const [providerLabel, setProviderLabel] = useState('');

  const [question, setQuestion] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const [summary, runtime] = await Promise.all([
          buildCoachContext(mode),
          getAiRuntimeConfig(),
        ]);
        if (cancelled) return;
        setCtx(summary);
        setHasKey(!!runtime.apiKey);
        setProviderLabel(
          runtime.apiKey ? `${runtime.provider} · ${runtime.model}` : ''
        );
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [ready, mode]);

  const onAsk = useCallback(async () => {
    if (!ctx || asking) return;
    setAskError(null);
    setAsking(true);
    setReply(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const runtime = await getAiRuntimeConfig();
      if (!runtime.apiKey) {
        setHasKey(false);
        setAskError('No API key configured. Add one in Settings.');
        return;
      }
      setHasKey(true);
      setProviderLabel(`${runtime.provider} · ${runtime.model}`);

      const userContent = defaultUserPromptForMode(mode, ctx.promptBlock, question);
      const messages = [
        { role: 'system' as const, content: buildSystemPrompt() },
        { role: 'user' as const, content: userContent },
      ];

      let tid = threadId;
      if (!tid) {
        const thread = await createCoachThread(mode, question.trim() || undefined);
        tid = thread.id;
        setThreadId(tid);
      }
      await appendCoachMessage(tid, 'user', question.trim() || userContent.slice(0, 200));

      const result = await coachChat({
        provider: runtime.provider,
        apiKey: runtime.apiKey,
        model: runtime.model,
        baseUrl: runtime.baseUrl,
        messages,
        signal: controller.signal,
      });

      setReply(result.content);
      await appendCoachMessage(tid, 'assistant', result.content);
    } catch (e) {
      if (controller.signal.aborted) return;
      const msg =
        e instanceof AiCoachError
          ? e.message
          : e instanceof Error
            ? e.message
            : String(e);
      setAskError(msg);
    } finally {
      setAsking(false);
      abortRef.current = null;
    }
  }, [ctx, asking, mode, question, threadId]);

  if (!ready || (!ctx && !loadError)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.muted}>Building local context…</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Could not build context</Text>
        <Text style={styles.muted}>{loadError}</Text>
      </View>
    );
  }

  if (!ctx) return null;

  const askLabel =
    mode === 'debrief' ? 'Get debrief' : mode === 'checkin' ? 'Run check-in' : 'Ask coach';

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
        <Text style={styles.kicker}>{coachModeLabel(ctx.mode)}</Text>
        <Text style={styles.title}>Coach</Text>

        {!hasKey ? (
          <View style={styles.placeholderCard}>
            <Text style={styles.reply}>{COACH_PLACEHOLDER_REPLY}</Text>
            <Pressable style={styles.settingsBtn} onPress={() => router.push('/settings')}>
              <Text style={styles.settingsBtnText}>Open Settings →</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.providerLine}>Using {providerLabel} (BYO key)</Text>
        )}

        <Text style={styles.label}>
          {mode === 'ask' ? 'Your question' : 'Optional note'}
        </Text>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={question}
          onChangeText={setQuestion}
          placeholder={
            mode === 'ask'
              ? 'e.g. How should I adjust protein on rest days?'
              : mode === 'debrief'
                ? 'Anything notable about the session?'
                : 'Focus for next week?'
          }
          placeholderTextColor={colors.textMuted}
          multiline
          editable={!asking}
        />

        <Pressable
          style={[styles.askBtn, (!hasKey || asking) && { opacity: 0.55 }]}
          onPress={() => {
            if (!hasKey) {
              router.push('/settings');
              return;
            }
            void onAsk();
          }}
          disabled={asking}
        >
          {asking ? (
            <ActivityIndicator color={colors.chipActiveText} />
          ) : (
            <Text style={styles.askBtnText}>
              {hasKey ? askLabel : 'Configure API key in Settings'}
            </Text>
          )}
        </Pressable>

        {askError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Request failed</Text>
            <Text style={styles.errorBody}>{askError}</Text>
          </View>
        ) : null}

        {asking ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.muted}>Waiting on provider…</Text>
          </View>
        ) : null}

        {reply ? (
          <View style={styles.replyCard}>
            <Text style={styles.section}>Coach reply</Text>
            <Text style={styles.reply}>{reply}</Text>
          </View>
        ) : null}

        <Text style={styles.section}>Assembled context (SQLite)</Text>
        <View style={styles.contextCard}>
          <Text style={styles.mono}>{ctx.promptBlock}</Text>
        </View>

        <Text style={styles.footer}>
          Assembled {new Date(ctx.assembledAt).toLocaleString()}
          {threadId ? ` · thread ${threadId.slice(0, 12)}…` : ''}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  kicker: {
    color: colors.accent,
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 4, marginBottom: spacing.md },
  providerLine: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm },
  placeholderCard: {
    backgroundColor: colors.accentDim,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  settingsBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  settingsBtnText: { color: colors.chipActiveText, fontWeight: '800', fontSize: 13 },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
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
  inputMultiline: { minHeight: 72, textAlignVertical: 'top', marginBottom: spacing.sm },
  askBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  askBtnText: { color: colors.chipActiveText, fontWeight: '900', fontSize: 15 },
  errorCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.danger,
    marginBottom: spacing.md,
  },
  errorTitle: { color: colors.danger, fontWeight: '800', marginBottom: 4 },
  errorBody: { color: colors.text, lineHeight: 20 },
  loadingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  replyCard: {
    backgroundColor: colors.accentDim,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent,
    marginBottom: spacing.lg,
  },
  reply: { color: colors.text, lineHeight: 22, fontSize: 15 },
  section: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  contextCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mono: {
    color: colors.text,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  muted: { color: colors.textMuted, textAlign: 'center' },
  footer: { color: colors.textMuted, fontSize: 11, marginTop: spacing.md },
});
