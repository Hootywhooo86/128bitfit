import { Stack } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { settingsStyles as styles } from '@/components/settings/settings-styles';
import { ToggleRow } from '@/components/ToggleRow';
import { Label, Screen } from '@/components/ui';
import {
  FAMILY_SQL_URL,
  familyStatus,
  sendFamilyNow,
  setShare,
  signInFamily,
  signOutFamily,
  type FamilyStatus,
} from '@/lib/family';
import { HEALTH_APP } from '@/lib/health/platform';
import { colors } from '@/lib/theme';

/**
 * Settings → 128bit family: send workouts and daily health totals to the family
 * feed in your own Supabase project, for 128bit Tracker's timeline. Off until
 * you sign in and switch each one on.
 */
export default function FamilyScreen() {
  const [status, setStatus] = useState<FamilyStatus | null>(null);
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const s = await familyStatus();
    setStatus(s);
    if (s.project) {
      setUrl((u) => u || s.project!.url);
      setAnonKey((k) => k || s.project!.anonKey);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the saved state when the screen opens
    void refresh();
  }, [refresh]);

  async function run(fn: () => Promise<void>, failTitle: string) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert(failTitle, e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  if (!status) {
    return (
      <Screen section="128bit family" back>
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  const signedIn = !!status.email;

  return (
    <Screen section="128bit family" back>
      <Stack.Screen options={{ title: '128bit family' }} />
      <Text style={styles.muted}>
        Send what you do here to 128bit Tracker&apos;s timeline, next to your books, shows and
        everything else. It goes to your own Supabase project (the one 128bitPlay uses), never
        to a server of ours. Off until you sign in and switch something on.
      </Text>

      {signedIn ? (
        <>
          <Text style={styles.muted}>
            Signed in as {status.email}.{' '}
            {status.waiting
              ? `${status.waiting} waiting to send.`
              : status.lastSent
                ? `Last sent ${new Date(status.lastSent).toLocaleString()}.`
                : 'Nothing sent yet.'}
          </Text>
          {status.lastError ? <Text style={[styles.muted, { color: colors.text }]}>{status.lastError}</Text> : null}

          <ToggleRow
            name="Workouts"
            sub="Each finished session: name, minutes, exercises and sets; for cardio the sport and distance. Deleting one here removes it there."
            value={status.share.workouts}
            onChange={(workouts) => run(() => setShare({ ...status.share, workouts }), 'Could not save that')}
          />
          <ToggleRow
            name={`Daily ${HEALTH_APP} totals`}
            sub="Steps, sleep, resting heart rate, active calories and distance for the last 7 days, as the app reads them. Weight is never sent. Missing readings stay blank, not 0."
            value={status.share.health}
            onChange={(health) => run(() => setShare({ ...status.share, health }), 'Could not save that')}
          />

          <Pressable
            style={styles.save}
            disabled={busy}
            onPress={() => run(() => sendFamilyNow(), 'Could not send')}
          >
            <Text style={styles.saveText}>{busy ? 'Working…' : 'Send now'}</Text>
          </Pressable>
          <Pressable
            style={styles.browseBtn}
            onPress={() =>
              Alert.alert('Sign out?', 'Nothing more is sent, and anything still waiting is dropped.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Sign out', style: 'destructive', onPress: () => run(signOutFamily, 'Could not sign out') },
              ])
            }
          >
            <Text style={styles.browseText}>Sign out</Text>
          </Pressable>
        </>
      ) : (
        <View>
          <Label>SUPABASE PROJECT URL</Label>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="https://abcd1234.supabase.co"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Label>ANON PUBLIC KEY</Label>
          <TextInput
            style={styles.input}
            value={anonKey}
            onChangeText={setAnonKey}
            placeholder="From Supabase → Settings → API"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Label>EMAIL</Label>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />
          <Label>PASSWORD</Label>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
          />
          <Pressable
            style={styles.save}
            disabled={busy}
            onPress={() =>
              run(async () => {
                await signInFamily({ url, anonKey }, email, password);
                setPassword('');
              }, 'Could not sign in')
            }
          >
            <Text style={styles.saveText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
          </Pressable>
          <Text style={styles.hint}>
            Use the same account as 128bitPlay. No 128bitPlay? Create a free Supabase project, run
            the family setup SQL in its SQL Editor, and add a user under Authentication.
          </Text>
          <Pressable style={styles.browseBtn} onPress={() => Linking.openURL(FAMILY_SQL_URL)}>
            <Text style={styles.browseText}>Open the setup SQL →</Text>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}
