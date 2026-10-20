import { useAuth, useClerk, useSSO, useUser } from '@clerk/expo';
import { useHostedAuth } from '@clerk/expo/hosted-auth';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Note, Screen } from '@/components/ui';
import { clerkConfigured } from '@/lib/clerk';
import { colors, fonts, spacing, themedStyles } from '@/lib/theme';

export { ErrorScreen as ErrorBoundary } from '@/components/ErrorScreen';

// Closes the Google tab when it hands back to the app.
WebBrowser.maybeCompleteAuthSession();

/**
 * Clerk account: a second way to sign in, beside the 128bit family account. Email or
 * Google — the person picks; Google is never required.
 */
export default function ClerkScreen() {
  if (!clerkConfigured) {
    return (
      <Screen section="Clerk account" back>
        <Note>
          Clerk sign-in isn&apos;t set up in this build yet. The 128bit family account in Settings still works.
        </Note>
      </Screen>
    );
  }
  return <ClerkAccount />;
}

function ClerkAccount() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { startHostedAuth } = useHostedAuth();
  const { startSSOFlow } = useSSO();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Clerk account', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const withEmail = () => run('email', () => startHostedAuth({ mode: 'sign-in' }));

  const withGoogle = () =>
    run('google', async () => {
      const { createdSessionId, setActive } = await startSSOFlow({ strategy: 'oauth_google' });
      if (createdSessionId && setActive) await setActive({ session: createdSessionId });
    });

  const confirmSignOut = () =>
    Alert.alert('Sign out of Clerk?', 'Nothing on this phone is deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void run('signout', () => signOut()) },
    ]);

  if (!isLoaded) {
    return (
      <Screen section="Clerk account" back>
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
        <Note>Needs a connection the first time. Training and logging don&apos;t wait on it.</Note>
      </Screen>
    );
  }

  if (!isSignedIn) {
    return (
      <Screen section="Clerk account" back>
        <Note>
          Sign in with your email, or with Google if you&apos;d rather. Either works; Google is optional. This is
          separate from the 128bit family account for now.
        </Note>
        <Card>
          <Pressable style={[s.btn, busy && s.dim]} onPress={withEmail} disabled={!!busy}>
            <Text style={s.btnText}>{busy === 'email' ? 'OPENING…' : 'CONTINUE WITH EMAIL'}</Text>
          </Pressable>
          <Pressable style={[s.ghost, busy && s.dim]} onPress={withGoogle} disabled={!!busy}>
            <Text style={s.ghostText}>{busy === 'google' ? 'Opening Google…' : 'Continue with Google'}</Text>
          </Pressable>
          <Text style={s.note}>New here? Either button creates your account.</Text>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen section="Clerk account" back>
      <Card>
        <Text style={s.label}>SIGNED IN</Text>
        <Text style={s.email}>{user?.primaryEmailAddress?.emailAddress ?? 'Clerk account'}</Text>
      </Card>
      <Pressable style={[s.ghost, busy && s.dim]} onPress={confirmSignOut} disabled={!!busy}>
        <Text style={s.ghostText}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    center: { paddingVertical: 60, alignItems: 'center' },
    label: { fontFamily: fonts.pixel, fontSize: 10, color: colors.textMuted, letterSpacing: 1, marginTop: spacing.sm },
    email: { fontFamily: fonts.bodySemi, fontSize: 16, color: colors.text, marginTop: 4 },
    note: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, lineHeight: 17, marginTop: spacing.sm },
    btn: { backgroundColor: colors.accent, paddingVertical: 12, alignItems: 'center', marginTop: spacing.md },
    btnText: { fontFamily: fonts.pixel, fontSize: 12, color: colors.bg, letterSpacing: 1 },
    ghost: { paddingVertical: 12, alignItems: 'center' },
    ghostText: { fontFamily: fonts.bodySemi, fontSize: 14, color: colors.accent },
    dim: { opacity: 0.5 },
  })
);
