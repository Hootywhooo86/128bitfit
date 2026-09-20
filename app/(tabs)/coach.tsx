import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@/lib/theme';

export default function CoachScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Coach</Text>
      <Text style={styles.muted}>
        AI coach is out of scope for this foundation slice. Placeholder only.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  muted: { color: colors.textMuted, lineHeight: 20 },
});
