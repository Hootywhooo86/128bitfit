import { Link, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/db/DatabaseProvider';
import { getDayFuelSummary } from '@/db/food-queries';
import { formatKcal } from '@/lib/nutrition';
import { colors, spacing } from '@/lib/theme';

export default function HomeScreen() {
  const { exerciseCount, foodCount, ready } = useDb();
  const [calories, setCalories] = useState<number | null>(null);
  const [calorieTarget, setCalorieTarget] = useState(2200);

  const refresh = useCallback(async () => {
    if (!ready) return;
    try {
      const s = await getDayFuelSummary(new Date());
      setCalories(s.totals.calories);
      setCalorieTarget(s.goals.calorieTarget);
    } catch {
      /* ignore */
    }
  }, [ready]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>128BIT FIT</Text>
      <Text style={styles.sub}>Offline-first fitness + nutrition</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Today</Text>
        <Text style={styles.stat}>
          {calories == null ? '—' : formatKcal(calories)} / {formatKcal(calorieTarget)} kcal
        </Text>
        <Text style={styles.hint}>Steps — coming soon (Health Connect)</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Offline database</Text>
        <Text style={styles.stat}>{exerciseCount.toLocaleString()} exercises</Text>
        <Text style={styles.stat}>{foodCount.toLocaleString()} foods</Text>
        <Text style={styles.hint}>Imported once into SQLite — ready offline.</Text>
      </View>

      <Link href="/exercise" style={styles.link}>
        <Text style={styles.linkText}>Browse Exercise Library →</Text>
      </Link>

      <Text style={styles.muted}>
        Train + Fuel logging work offline. Coach AI and Health Connect come later.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.md },
  brand: { color: colors.accent, fontSize: 28, fontWeight: '900', letterSpacing: 2, marginTop: spacing.md },
  sub: { color: colors.textMuted, marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  cardTitle: { color: colors.text, fontWeight: '700', marginBottom: 4 },
  stat: { color: colors.accent, fontSize: 18, fontWeight: '700' },
  hint: { color: colors.textMuted, marginTop: 8, fontSize: 13 },
  link: {
    backgroundColor: colors.accentDim,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  linkText: { color: colors.accent, fontWeight: '700', textAlign: 'center' },
  muted: { color: colors.textMuted, fontSize: 12, marginTop: spacing.lg, lineHeight: 18 },
});
