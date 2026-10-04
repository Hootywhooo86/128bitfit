import { Stack } from 'expo-router';
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { health } from '@/lib/health';
import { HealthSyncCard } from '@/components/HealthSyncCard';
import { colors, spacing, themedStyles } from '@/lib/theme';
import { Screen } from '@/components/ui';
import { HEALTH_APP } from '@/lib/health/platform';

const POLICY_URL = 'https://github.com/Hootywhooo86/128bitfit/blob/main/docs/privacy-policy.md';

/**
 * Privacy, and specifically what health data the app reads and writes.
 *
 * Health Connect requires an app to be able to explain its health data use, and
 * Google Play requires it before granting Health Connect access. This is that
 * explanation. It is also just the honest answer to "what does this thing do
 * with my data", which is worth having regardless.
 */
export default function PrivacyScreen() {
  return (
    <Screen section="Privacy" back>
      <Stack.Screen options={{ title: 'Privacy & health data' }} />

      <View style={styles.card}>
        <Text style={styles.h1}>Your data stays on your phone</Text>
        <Text style={styles.body}>
          There is no 128BIT FIT account, server or database. Everything you log lives in a
          database on this device. No analytics, no telemetry, no crash reporting —
          the app has no backend to send anything to.
        </Text>
      </View>

      <Text style={styles.section}>{HEALTH_APP}</Text>

      <HealthSyncCard />

      <View style={styles.card}>
        <Text style={styles.body}>
          Connecting {HEALTH_APP} is optional. Every screen works without it, and the app
          shows &quot;Not connected&quot; rather than inventing numbers. Each permission is
          separate — granting one does not grant the rest, and refusing one only costs you
          the feature below it.
        </Text>

        <View style={styles.row}>
          <Text style={styles.perm}>Read steps</Text>
          <Text style={styles.permWhy}>
            Shows your step count for today on Home. Read when you open the screen, not
            stored in the database, and not sent anywhere.
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.perm}>Read sleep and resting heart rate</Text>
          <Text style={styles.permWhy}>
            The readiness and rest scores on Home. Without sleep there is no score and the
            card says so rather than guessing one.
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.perm}>Read heart rate and active calories</Text>
          <Text style={styles.permWhy}>
            Read for the exact window of a workout you finish, to work out what it cost. A
            figure measured by your watch is shown as measured; anything the app worked out
            itself is labelled an estimate.
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.perm}>Read and write weight</Text>
          <Text style={styles.permWhy}>
            A weigh-in from your scale shows up here without re-typing it, and one you type
            here goes back so your other apps have it.
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.perm}>Write food and water</Text>
          <Text style={styles.permWhy}>
            Meals and water you log are copied across with their calories and macros, so
            anything else reading your nutrition sees the same figures. Edit one and the copy
            is updated; delete one and the copy is deleted with it.
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.perm}>Write exercise</Text>
          <Text style={styles.permWhy}>
            Writes workouts you complete back to {HEALTH_APP} so your other apps can see
            them — when you trained and for how long. Calories are not written, because the
            app&apos;s figure is usually an estimate and {HEALTH_APP} has nowhere to say so.
          </Text>
        </View>

        <Text style={styles.body}>
          No health data is ever transmitted off this device by this app. It is never used
          for advertising, sold, or shared. You can revoke access at any time in Health
          Connect.
        </Text>

        <Pressable style={styles.button} onPress={() => health.openSettings()}>
          <Text style={styles.buttonText}>Open {HEALTH_APP}</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>When the app uses the internet</Text>
      <View style={styles.card}>
        <Text style={styles.body}>
          <Text style={styles.bold}>Barcode scanning.</Text> A barcode not found in the
          bundled USDA database is sent to Open Food Facts to look up the product. Only the
          barcode number — nothing else.
        </Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>AI Coach.</Text> Off until you add your own API key. When
          you ask something, a short summary of recent training and nutrition goes directly
          to the provider you chose. It does not pass through any server of ours, because
          there isn&apos;t one. Your key is stored in the Android Keystore, never logged, and
          never included in exports.
        </Text>
        <Text style={styles.body}>
          <Text style={styles.bold}>Exercise images.</Text> Loaded from GitHub as you browse
          the library.
        </Text>
        <Text style={styles.body}>
          Nothing else. The exercise and food databases ship inside the app and work with no
          connection at all.
        </Text>
      </View>

      <Text style={styles.section}>Taking your data with you</Text>
      <View style={styles.card}>
        <Text style={styles.body}>
          Settings → Export data writes your complete history as JSON and CSV. Deleting the
          app deletes everything; there is no server copy to restore, so export first if you
          want one.
        </Text>
      </View>

      <Pressable style={styles.link} onPress={() => Linking.openURL(POLICY_URL)}>
        <Text style={styles.linkText}>Read the full privacy policy →</Text>
      </Pressable>
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  h1: { color: colors.text, fontWeight: '900', fontSize: 17, marginBottom: spacing.xs },
  section: {
    color: colors.text,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  body: { color: colors.textMuted, fontSize: 13, lineHeight: 19 },
  bold: { color: colors.text, fontWeight: '700' },
  row: {
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: spacing.sm,
    gap: 2,
  },
  perm: { color: colors.text, fontWeight: '700', fontSize: 13 },
  permWhy: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  button: {
    backgroundColor: colors.chipActive,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  buttonText: { color: colors.chipActiveText, fontWeight: '800', letterSpacing: 1 },
  link: { marginTop: spacing.lg, alignItems: 'center' },
  linkText: { color: colors.accent, fontWeight: '700' },
}));
