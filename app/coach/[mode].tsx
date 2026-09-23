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
import {
  buildCoachMessages,
  isOpeningTurn,
  threadTitle,
  type CoachTurn,
} from '@/lib/coach-thread';
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
  // A conversation, not a single reply. The old `reply` slot was overwritten
  // on every ask, which is why three questions felt like three separate
  // screens rather than one thread.
  const [turns, setTurns] = useState<CoachTurn[]>([]);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** What was asked first, so the opening can be rebuilt for later turns. */
  const openingQuestion = useRef('');

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
    const typed = question.trim();
    const opening = isOpeningTurn(turns);
    // After the opening there is nothing to send but the question itself.
    if (!opening && !typed) return;

    setAskError(null);
    setAsking(true);
    const controller = new AbortController();
    abortRef.current = controller;

    // Shown straight away, so the question does not vanish for the length of
    // the round trip. Removed again if the send fails.
    const asked: CoachTurn = { role: 'user', content: typed || coachModeLabel(mode) };
    setTurns((prev) => [...prev, asked]);
    setQuestion('');

    try {
      const runtime = await getAiRuntimeConfig();
      if (!runtime.apiKey) {
        setHasKey(false);
        throw new AiCoachError('No API key configured. Add one in Settings.');
      }
      setHasKey(true);
      setProviderLabel(`${runtime.provider} · ${runtime.model}`);

      if (opening) openingQuestion.current = typed;

      // The opening carries the mode's instructions and the local summary, and
      // is the only message that does. Follow-ups are just what was asked —
      // the model already has the rest of the thread.
      const messages = buildCoachMessages({
        system: buildSystemPrompt(),
        opening: defaultUserPromptForMode(mode, ctx.promptBlock, openingQuestion.current),
        turns: opening ? [] : [...turns, asked],
      });

      let tid = threadId;
      if (!tid) {
        const thread = await createCoachThread(mode, threadTitle(typed, coachModeLabel(mode)));
        tid = thread.id;
        setThreadId(tid);
      }
      await appendCoachMessage(tid, 'user', asked.content);

      const result = await coachChat({
        provider: runtime.provider,
        apiKey: runtime.apiKey,
        model: runtime.model,
        baseUrl: runtime.baseUrl,
        messages,
        signal: controller.signal,
      });

      setTurns((prev) => [...prev, { role: 'assistant', content: result.content }]);
      await appendCoachMessage(tid, 'assistant', result.content);
    } catch (e) {
      if (controller.signal.aborted) return;
      setAskError(e instanceof Error ? e.message : String(e));
      // Take the question back out and put the text back in the box, so a
      // failed send costs nothing but the wait.
      setTurns((prev) => prev.filter((t) => t !== asked));
      setQuestion(typed);
    } finally {
      setAsking(false);
      abortRef.current = null;
    }
  }, [ctx, asking, mode, question, threadId, turns]);

  /**
   * Starts over: new thread, fresh context.
   *
   * The summary is assembled when the screen loads, so a conversation started
   * this morning is answering with this morning's numbers. Reset rebuilds it,
   * which is the only way to pick up a session logged since.
   */
  const onReset = useCallback(async () => {
    abortRef.current?.abort();
    setTurns([]);
    setThreadId(null);
    setQuestion('');
    setAskError(null);
    setAsking(false);
    openingQuestion.current = '';
    try {
      setCtx(await buildCoachContext(mode));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [mode]);

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

        <View style={styles.labelRow}>
          <Text style={styles.label}>
            {turns.length > 0
              ? 'Follow up'
              : mode === 'ask'
                ? 'Your question'
                : 'Optional note'}
          </Text>
          {turns.length > 0 ? (
            <Pressable onPress={() => void onReset()} hitSlop={10} disabled={asking}>
              <Text style={[styles.reset, asking && { opacity: 0.4 }]}>Reset</Text>
            </Pressable>
          ) : null}
        </View>
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={question}
          onChangeText={setQuestion}
          placeholder={
            turns.length > 0
              ? 'Ask a follow-up — it remembers what was said'
              : mode === 'ask'
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
              {!hasKey ? 'Configure API key in Settings' : turns.length > 0 ? 'Send' : askLabel}
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

        {turns.length > 0 ? (
          <View style={styles.thread}>
            {turns.map((t, i) => (
              <View
                key={`${i}-${t.role}`}
                style={t.role === 'user' ? styles.userBubble : styles.replyCard}
              >
                <Text style={styles.section}>{t.role === 'user' ? 'You' : 'Coach'}</Text>
                <Text style={styles.reply}>{t.content}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {turns.length === 0 ? (
          <>
            <Text style={styles.section}>Assembled context (SQLite)</Text>
            <View style={styles.contextCard}>
              <Text style={styles.mono}>{ctx.promptBlock}</Text>
            </View>
          </>
        ) : (
          <Text style={styles.footer}>
            Context was assembled when this thread started. Reset to pick up anything logged
            since.
          </Text>
        )}

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
  thread: { gap: spacing.sm, marginTop: spacing.sm },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reset: { color: colors.textMuted, fontSize: 13, textDecorationLine: 'underline' },
  userBubble: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
  },
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
    backgroundColor: colors.track,
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
    backgroundColor: colors.track,
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
