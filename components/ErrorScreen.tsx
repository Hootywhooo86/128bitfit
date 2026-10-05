import { usePathname } from 'expo-router';
import type { ErrorBoundaryProps } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { errorMessage, errorReport } from '@/lib/error-report';
import { installedReleaseTag } from '@/lib/update-check';
import { colors, fonts, radius, spacing, themedStyles } from '@/lib/theme';

/**
 * What a screen shows instead of closing the app when something in it throws.
 *
 * One honest sentence, the error itself, a way to try again, and a way to
 * send the details on. Nothing is reported anywhere on its own: there is no
 * crash service, and the details only leave the phone if the user shares
 * them.
 *
 * Exported as `ErrorBoundary` from routes (Expo Router renders it when that
 * route throws), so the rest of the app stays usable.
 */
export function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
  const where = usePathname();
  const [shareFailed, setShareFailed] = useState(false);

  const share = async () => {
    try {
      await Share.share({
        message: errorReport({ error, where, build: installedReleaseTag(), platform: Platform.OS, at: new Date() }),
      });
    } catch {
      setShareFailed(true);
    }
  };

  return (
    <View style={s.wrap}>
      <ScrollView contentContainerStyle={s.inner}>
        <Text style={s.label}>SOMETHING BROKE</Text>
        <Text style={s.title}>This screen hit an error and stopped. Your saved data is safe.</Text>
        <Text style={s.detail} selectable>
          {errorMessage(error)}
        </Text>
        <Pressable style={s.primary} onPress={() => void retry()} accessibilityRole="button">
          <Text style={s.primaryT}>Try again</Text>
        </Pressable>
        <Pressable style={s.secondary} onPress={() => void share()} accessibilityRole="button">
          <Text style={s.secondaryT}>Share error details</Text>
        </Pressable>
        {shareFailed ? (
          <Text style={s.detail}>Couldn&apos;t open sharing. The error above can be selected and copied.</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.bg },
    inner: { padding: spacing.lg, paddingTop: 72, gap: spacing.md },
    label: { fontFamily: fonts.pixel, fontSize: 10, letterSpacing: 1, color: colors.textMuted },
    title: { color: colors.text, fontFamily: fonts.bodySemi, fontSize: 18, lineHeight: 25 },
    detail: { color: colors.textMuted, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
    primary: { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
    primaryT: { color: colors.onAccent, fontFamily: fonts.bodyBold, fontSize: 15 },
    secondary: {
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.borderBright,
      paddingVertical: 14,
      alignItems: 'center',
    },
    secondaryT: { color: colors.text, fontFamily: fonts.bodySemi, fontSize: 15 },
  })
);
