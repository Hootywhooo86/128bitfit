import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  buildCoachContext,
  coachModeLabel,
  COACH_PLACEHOLDER_REPLY,
  type CoachContextSummary,
  type CoachMode,
} from '@/db/coach-context';
import { useDb } from '@/db/DatabaseProvider';
import { colors, spacing } from '@/lib/theme';

function isCoachMode(v: string): v is CoachMode {
  return v === 'debrief' || v === 'ask' || v === 'checkin';
}

export default function CoachSessionScreen() {
  const { mode: modeParam } = useLocalSearchParams<{ mode: string }>();
  const raw = typeof modeParam === 'string' ? modeParam : Array.isArray(modeParam) ? modeParam[0] : '';
  const mode: CoachMode = isCoachMode(raw) ? raw : 'ask';
  const { ready } = useDb();
  const [ctx, setCtx] = useState<CoachContextSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        const summary = await buildCoachContext(mode);
        if (!cancelled) setCtx(summary);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, mode]);

  if (!ready || (!ctx && !error)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.muted}>Building local context…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Could not build context</Text>
        <Text style={styles.muted}>{error}</Text>
      </View>
    );
  }

  if (!ctx) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <Text style={styles.kicker}>{coachModeLabel(ctx.mode)}</Text>
      <Text style={styles.title}>Coach reply</Text>

      <View style={styles.replyCard}>
        <Text style={styles.reply}>{COACH_PLACEHOLDER_REPLY}</Text>
      </View>

      <Text style={styles.section}>Assembled context (SQLite)</Text>
      <View style={styles.contextCard}>
        <Text style={styles.mono}>{ctx.promptBlock}</Text>
      </View>

      <Text style={styles.footer}>
        Assembled {new Date(ctx.assembledAt).toLocaleString()} · ready for AI provider wiring
      </Text>
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
