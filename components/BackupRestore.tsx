import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text } from 'react-native';
import * as Sharing from 'expo-sharing';
import { describePlan, pickBackup, restoreBackup, runBackup } from '@/lib/backup';
import { colors, spacing, themedStyles } from '@/lib/theme';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Writes a full backup and opens the share sheet so it leaves the phone. */
export function BackupButton() {
  const [busy, setBusy] = useState(false);

  const onBackup = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const file = await runBackup();
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Backup saved on this phone only', 'There is no app here to send it to, and it is deleted if the app is uninstalled.');
        return;
      }
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save your backup' });
    } catch (e) {
      Alert.alert('Backup failed', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable style={[s.button, busy && s.busy]} onPress={() => void onBackup()} disabled={busy}>
      {busy ? <ActivityIndicator color={colors.chipActiveText} /> : <Text style={s.buttonText}>Back up everything</Text>}
    </Pressable>
  );
}

/**
 * Picks a backup, says what is in it, and restores it on a yes.
 * `onRestored` runs after a successful restore.
 */
export function RestoreButton({ onRestored, label = 'Restore from a backup' }: { onRestored?: () => void; label?: string }) {
  const [busy, setBusy] = useState(false);

  const onRestore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await pickBackup();
      if (!picked) return;
      const confirmed = await new Promise<boolean>((resolve) =>
        Alert.alert(
          'Restore this backup?',
          `${picked.name} has ${describePlan(picked.plan)}.\n\nNothing already on this phone is changed or deleted. Your settings are set back to the backup's.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Restore', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) }
        )
      );
      if (!confirmed) return;
      const result = await restoreBackup(picked.plan);
      const added = Object.entries(result.added)
        .filter(([, n]) => n > 0)
        .map(([what, n]) => `${n} ${what}`)
        .join(', ');
      const notes = [
        result.alreadyHere ? `${result.alreadyHere} were already on this phone and left as they were.` : '',
        result.unreadable ? `${result.unreadable} could not be read and were skipped.` : '',
      ]
        .filter(Boolean)
        .join(' ');
      Alert.alert('Restored', `${added || 'Nothing new to add.'}${notes ? `\n\n${notes}` : ''}`, [
        { text: 'OK', onPress: onRestored },
      ]);
    } catch (e) {
      Alert.alert('Restore failed', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable style={[s.outline, busy && s.busy]} onPress={() => void onRestore()} disabled={busy}>
      {busy ? <ActivityIndicator color={colors.accent} /> : <Text style={s.outlineText}>{label}</Text>}
    </Pressable>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    button: {
      backgroundColor: colors.chipActive,
      borderRadius: 12,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    buttonText: { color: colors.chipActiveText, fontWeight: '900', letterSpacing: 1 },
    outline: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderBright,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    outlineText: { color: colors.text, fontWeight: '800', letterSpacing: 1 },
    busy: { opacity: 0.7 },
  })
);
