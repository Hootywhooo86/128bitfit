import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@/lib/theme';

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
    blurb: 'Assemble a week-ready summary from SQLite for coaching later.',
  },
];

export default function CoachScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 48 }}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Coach</Text>
          <Text style={styles.muted}>
            Local stubs for now — context is built from your SQLite data. AI replies need a
            provider in Settings (coming later).
          </Text>
        </View>
        <Pressable style={styles.gear} onPress={() => router.push('/settings')}>
          <Text style={styles.gearText}>Settings</Text>
        </Pressable>
      </View>

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
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
});
