import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useDb } from '@/db/DatabaseProvider';
import { colors, spacing } from '@/lib/theme';

export default function TrainScreen() {
  const { exerciseCount } = useDb();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Train</Text>
      <Text style={styles.muted}>
        Workout logging lands later. For now, explore the offline exercise library ({exerciseCount}{' '}
        exercises).
      </Text>
      <Link href="/exercise" style={styles.btn}>
        <Text style={styles.btnText}>Open Exercise Library</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  muted: { color: colors.textMuted, lineHeight: 20 },
  btn: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 10,
    borderColor: colors.accent,
    borderWidth: 1,
  },
  btnText: { color: colors.accent, fontWeight: '700', textAlign: 'center' },
});
