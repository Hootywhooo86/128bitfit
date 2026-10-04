import React, { useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { checkForUpdate, installedReleaseTag, type UpdateCheck } from '@/lib/update-check';
import { colors, fonts, radius, spacing, themedStyles } from '@/lib/theme';

const IOS = Platform.OS === 'ios';

/** Settings → which build this is, and whether GitHub has a newer one for this kind of phone. */
export function UpdateCard() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UpdateCheck | null>(null);
  const installed = installedReleaseTag();

  const check = async () => {
    if (busy) return;
    setBusy(true);
    try {
      setResult(await checkForUpdate(IOS ? 'ios' : 'android'));
    } finally {
      setBusy(false);
    }
  };

  const open = (url: string) => {
    Linking.openURL(url).catch(() =>
      setResult({ status: 'failed', message: `Could not open the browser. The download is at ${url}` })
    );
  };

  return (
    <View style={s.card}>
      <Text style={s.title}>App version</Text>
      <Text style={s.muted}>
        {installed ?? 'A development build — it does not know which release it is.'}
      </Text>

      <Pressable style={[s.btn, busy && { opacity: 0.6 }]} onPress={() => void check()} disabled={busy}>
        {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={s.btnT}>Check for updates</Text>}
      </Pressable>

      {result?.status === 'current' ? (
        <Text style={s.muted}>You are on the newest release.</Text>
      ) : null}

      {result?.status === 'available' || result?.status === 'unknown-build' ? (
        <>
          <Text style={s.found}>
            {result.status === 'available'
              ? `${result.latest.tag} is available.`
              : `The newest release is ${result.latest.tag}.`}
          </Text>
          <Text style={s.muted}>
            {IOS
              ? 'An iPhone build is installed from a computer: download the .ipa there and install it over this one with Sideloadly, using the same Apple ID. Your data stays.'
              : 'Installing it keeps your data — it updates this app in place. Android will ask to allow installs from your browser the first time.'}
          </Text>
          <Pressable
            style={s.btn}
            onPress={() => open(!IOS && result.latest.fileUrl ? result.latest.fileUrl : result.latest.pageUrl)}
          >
            <Text style={s.btnT}>{!IOS && result.latest.fileUrl ? 'Download APK' : 'Open release page'}</Text>
          </Pressable>
          {!IOS && result.latest.fileUrl ? (
            <Pressable onPress={() => open(result.latest.pageUrl)} style={{ paddingVertical: 8 }}>
              <Text style={s.link}>Release notes →</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}

      {result?.status === 'hidden' ? (
        <>
          <Text style={s.muted}>
            The releases aren&apos;t visible to the app — the repository may be private. They still
            open in a browser signed in to GitHub.
          </Text>
          <Pressable style={s.btn} onPress={() => open(result.pageUrl)}>
            <Text style={s.btnT}>Open releases on GitHub</Text>
          </Pressable>
        </>
      ) : null}

      {result?.status === 'failed' ? <Text style={s.err}>{result.message}</Text> : null}
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
  card: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { color: colors.text, fontFamily: fonts.bodyBold, marginBottom: 6, fontSize: 16 },
  muted: { color: colors.textMuted, lineHeight: 20, fontFamily: fonts.body, marginTop: 4 },
  found: { color: colors.text, fontFamily: fonts.bodySemi, fontSize: 14, marginTop: 10 },
  btn: {
    marginTop: spacing.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnT: { color: colors.onAccent, fontFamily: fonts.bodyBold, fontSize: 14 },
  link: { color: colors.accent, fontFamily: fonts.bodySemi, fontSize: 13 },
  err: { color: colors.danger, marginTop: 10, lineHeight: 19, fontFamily: fonts.body },
}));
