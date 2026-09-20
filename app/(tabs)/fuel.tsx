import { StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/db/DatabaseProvider';
import { colors, spacing } from '@/lib/theme';

export default function FuelScreen() {
  const { foodCount } = useDb();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fuel</Text>
      <View style={styles.card}>
        <Text style={styles.statLabel}>Foods imported</Text>
        <Text style={styles.stat}>{foodCount.toLocaleString()}</Text>
      </View>
      <Text style={styles.muted}>
        Nutrition logging UI comes later. Foods are already in SQLite for offline search.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statLabel: { color: colors.textMuted, marginBottom: 4 },
  stat: { color: colors.accent, fontSize: 36, fontWeight: '900' },
  muted: { color: colors.textMuted, lineHeight: 20 },
});
