import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getAiSettings } from '@/db/ai-settings';
import { Screen } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { countCompletedSessions } from '@/db/workout-queries';
import { colors, spacing, themedStyles } from '@/lib/theme';

const CARDS = [
  {
    mode: 'debrief' as const,
    title: 'Post-workout debrief',
    blurb: 'Reflect on your last session with local training + fuel context.',
  },
  {
    mode: 'ask' as const,
    title: 'Ask anything',
    blurb: 'Prep a question with today’s macros, weight, and recent training.',
  },
  {
    mode: 'checkin' as const,
    title: 'Weekly check-in',
    blurb: 'Your week in one summary: what went well and what to change.',
  },
];

export default function CoachScreen() {
  const router = useRouter();
  const { ready } = useDb();
  const [hasKey, setHasKey] = useState(false);
  const [providerLine, setProviderLine] = useState('');
  // null while unknown — an empty state must not flash before we have counted.
  const [sessionCount, setSessionCount] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      void (async () => {
        const ai = await getAiSettings();
        setHasKey(ai.hasKey);
        setProviderLine(ai.hasKey ? `${ai.provider} · ${ai.model}` : '');
        setSessionCount(await countCompletedSessions());
      })();
    }, [ready])
  );

  return (
    <Screen section="Coach">
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.muted}>
            {hasKey
              ? `Bring your own key · ${providerLine}. Each question sends a short summary of your logs, never the whole history.`
              : 'Bring your own key — add a provider and API key in Settings. Until then, the coach shows the summary it would send.'}
          </Text>
        </View>
        <Pressable style={styles.gear} onPress={() => router.push('/settings')}>
          <Text style={styles.gearText}>Settings</Text>
        </Pressable>
      </View>

      {!hasKey ? (
        <Pressable style={styles.byoCard} onPress={() => router.push('/settings')}>
          <Text style={styles.byoTitle}>Bring your own key</Text>
          <Text style={styles.blurb}>
            Anthropic, OpenAI, Gemini, OpenRouter, Groq, Hugging Face, or your own server. Your key
            stays in this phone's secure storage.
          </Text>
          <Text style={styles.cta}>Configure in Settings →</Text>
        </Pressable>
      ) : null}

      {sessionCount === 0 ? (
        // The brief is explicit: say there is nothing useful yet rather than
        // inventing encouragement from an empty database.
        <View style={styles.emptyCard}>
          <Text style={styles.byoTitle}>Nothing to go on yet</Text>
          <Text style={styles.blurb}>
            Log a couple of sessions and I&apos;ll have something useful to tell you. Until
            then there is no training history to read.
          </Text>
        </View>
      ) : null}

      {CARDS.map((c) => (
        <Pressable
          key={c.mode}
          style={styles.card}
          onPress={() => router.push(`/coach/${c.mode}`)}
        >
          <Text style={styles.cardTitle}>{c.title}</Text>
          <Text style={styles.blurb}>{c.blurb}</Text>
          <Text style={styles.cta}>Open →</Text>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  headerRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  muted: { color: colors.textMuted, lineHeight: 20, marginTop: 6 },
  gear: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignSelf: 'flex-start',
  },
  gearText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  byoCard: {
    backgroundColor: colors.track,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent,
    marginBottom: spacing.md,
    gap: 6,
  },
  byoTitle: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    gap: 6,
  },
  cardTitle: { color: colors.accent, fontSize: 17, fontWeight: '800' },
  blurb: { color: colors.textMuted, lineHeight: 20, fontSize: 14 },
  cta: { color: colors.text, fontWeight: '700', marginTop: 4 },
}));
