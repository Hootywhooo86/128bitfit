import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ToggleRow } from '@/components/ToggleRow';
import { Card, Label, Note, Screen } from '@/components/ui';
import {
  family,
  familyPrefs,
  setShareHealth,
  setShareWorkouts,
  signInWithProvider,
  syncFamily,
  type FamilyPrefs,
} from '@/lib/family';
import { HEALTH_APP } from '@/lib/health/platform';
import { colors, fonts, spacing, themedStyles } from '@/lib/theme';

export { ErrorScreen as ErrorBoundary } from '@/components/ErrorScreen';

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * The 128bit family account: one sign-in across 128bitPlay, Tracker and the
 * rest. Signing in shares nothing by itself — each kind of data has its own
 * switch, off until you turn it on.
 */
export default function FamilyScreen() {
  const [status, setStatus] = useState<{ signedIn: boolean; email: string | null } | null>(null);
  const [prefs, setPrefs] = useState<FamilyPrefs | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([family.status(), familyPrefs()]);
    setStatus(s);
    setPrefs(p);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      Alert.alert('128bit family', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      await load();
    }
  };

  const signIn = () =>
    run('signin', async () => {
      await family.signIn(email, password);
      setPassword('');
    });

  const create = () =>
    run('create', async () => {
      const s = await family.signUp(email, password);
      setPassword('');
      if (!s) {
        Alert.alert('Check your email', `The 128bit account sent a confirmation link to ${email.trim()}. Open it, then sign in here.`);
      }
    });

  const google = () => run('google', () => signInWithProvider('google'));

  const signOut = () =>
    Alert.alert('Sign out of 128bit family?', 'Nothing on this phone is deleted. What was already shared stays in your family feed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void run('signout', () => family.signOut()) },
    ]);

  const syncNow = () =>
    run('sync', async () => {
      const r = await syncFamily({ force: true });
      const p = await familyPrefs();
      if (p.lastError) throw new Error(p.lastError);
      if (r) Alert.alert('Synced', `${r.sent} item${r.sent === 1 ? '' : 's'} sent to your family feed.`);
    });

  if (!status || !prefs) {
    return (
      <Screen section="128bit family" back>
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  if (!status.signedIn) {
    return (
      <Screen section="128bit family" back>
        <Note>
          One account for every 128bit app: Play, Tracker and FIT. Signing in shares nothing on its own; you choose
          what goes to your family feed afterwards.
        </Note>

        <Card>
          <Text style={s.label}>EMAIL</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
            placeholderTextColor={colors.textDim}
          />
          <Text style={s.label}>PASSWORD</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            placeholder="At least 6 characters"
            placeholderTextColor={colors.textDim}
          />
          <Pressable style={[s.btn, busy && s.dim]} onPress={signIn} disabled={!!busy}>
            <Text style={s.btnText}>{busy === 'signin' ? 'SIGNING IN…' : 'SIGN IN'}</Text>
          </Pressable>
          <Pressable style={[s.ghost, busy && s.dim]} onPress={create} disabled={!!busy}>
            <Text style={s.ghostText}>{busy === 'create' ? 'Creating…' : 'New here? Create a 128bit account'}</Text>
          </Pressable>
        </Card>

        <Card>
          <Pressable style={[s.ghost, busy && s.dim]} onPress={google} disabled={!!busy}>
            <Text style={s.ghostText}>{busy === 'google' ? 'Opening Google…' : 'Sign in with Google'}</Text>
          </Pressable>
          <Text style={s.note}>Use whichever you used in 128bitPlay or Tracker: it is the same account.</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen section="128bit family" back>
      <Card>
        <Text style={s.label}>SIGNED IN</Text>
        <Text style={s.email}>{status.email ?? '128bit account'}</Text>
        <Text style={s.note}>The same account as 128bitPlay and Tracker.</Text>
      </Card>

      <Label>SHARE TO YOUR FAMILY FEED</Label>
      <ToggleRow
        name="Workouts"
        sub="Each finished workout: its name, length, exercises and sets, or a cardio session's minutes and km."
        value={prefs.shareWorkouts}
        onChange={(v) => void setShareWorkouts(v).then(load)}
      />
      <ToggleRow
        name="Daily health summary"
        sub={`Steps, sleep, resting heart rate and active calories per day, from ${HEALTH_APP}.`}
        value={prefs.shareHealth}
        onChange={(v) => void setShareHealth(v).then(load)}
      />
      <Text style={s.note}>
        Shows up in Tracker&apos;s timeline. Only your account can see it. Food, weight and photos are never shared.
      </Text>

      {prefs.shareWorkouts || prefs.shareHealth ? (
        <Card>
          <Text style={s.note}>
            {prefs.lastError
              ? `Last sync didn't go through: ${prefs.lastError}`
              : prefs.lastSync
                ? `Last synced ${when(prefs.lastSync)}. It syncs by itself every so often while the app is open.`
                : 'Not synced yet.'}
          </Text>
          <Pressable style={[s.btn, busy && s.dim]} onPress={syncNow} disabled={!!busy}>
            <Text style={s.btnText}>{busy === 'sync' ? 'SYNCING…' : 'SYNC NOW'}</Text>
          </Pressable>
        </Card>
      ) : null}

      <Pressable style={[s.ghost, busy && s.dim]} onPress={signOut} disabled={!!busy}>
        <Text style={s.ghostText}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    center: { paddingVertical: 60, alignItems: 'center' },
    label: { fontFamily: fonts.pixel, fontSize: 10, color: colors.textMuted, letterSpacing: 1, marginTop: spacing.sm },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
      fontFamily: fonts.body,
      fontSize: 15,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      marginTop: 6,
    },
    email: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text, marginTop: 4 },
    note: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: spacing.sm },
    btn: { backgroundColor: colors.accent, paddingVertical: 12, alignItems: 'center', marginTop: spacing.md },
    btnText: { fontFamily: fonts.pixel, fontSize: 12, color: colors.bg, letterSpacing: 1 },
    ghost: { paddingVertical: 12, alignItems: 'center' },
    ghostText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.accent },
    dim: { opacity: 0.5 },
  })
);
