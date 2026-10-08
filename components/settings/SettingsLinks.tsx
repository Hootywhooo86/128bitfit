import { useRouter, type Href } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { accentName } from '@/lib/accent';
import { HEALTH_APP } from '@/lib/health/platform';
import { colors } from '@/lib/theme';
import { settingsStyles as styles } from './settings-styles';

function LinkCard({ href, title, sub, dot }: { href: Href; title: string; sub: string; dot?: boolean }) {
  const router = useRouter();
  return (
    <Pressable style={styles.charCard} onPress={() => router.push(href)}>
      {dot ? <View style={[styles.themeDot, { backgroundColor: colors.accent }]} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={styles.aiTitle}>{title}</Text>
        <Text style={styles.muted}>{sub}</Text>
      </View>
    </Pressable>
  );
}

/** The cards that open Settings' own sub-screens. */
export function SettingsLinks() {
  return (
    <>
      <LinkCard href="/settings/privacy" title="Privacy & health data" sub="What is stored, what leaves the device →" />
      <LinkCard
        href="/settings/theme"
        title="Theme colour"
        sub={`${accentName(colors.accent)} · free, all of them →`}
        dot
      />
      <LinkCard href="/settings/map" title="Map" sub="Dark or light, km or miles, route colours →" />
      <LinkCard href="/settings/health" title={HEALTH_APP} sub="Check what it is actually reporting →" />
      <LinkCard href="/settings/family" title="128bit family" sub="Send workouts and health totals to 128bit Tracker →" />
      <LinkCard href="/settings/import" title="Import exercises" sub="From Hevy, a CSV, or a JSON export →" />
      <LinkCard href="/settings/export" title="Export data" sub="Download everything as CSV and JSON →" />
    </>
  );
}
