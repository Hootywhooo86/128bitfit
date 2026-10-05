import { Stack } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import { runExport, type ExportResult } from '@/lib/export';
import { colors, spacing, themedStyles } from '@/lib/theme';
import { Screen } from '@/components/ui';
import { BackupButton, RestoreButton } from '@/components/BackupRestore';

function formatSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ExportScreen() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ExportResult | null>(null);

  async function onExport() {
    setBusy(true);
    try {
      setResult(await runExport());
    } catch (e) {
      // House style: one honest sentence, never a silent no-op.
      Alert.alert(
        'Export failed',
        `Could not write the export files. ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setBusy(false);
    }
  }

  async function onShare(uri: string, mimeType: string) {
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'This device has no app to share files with.');
        return;
      }
      await Sharing.shareAsync(uri, { mimeType, UTI: mimeType });
    } catch (e) {
      Alert.alert('Share failed', e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Screen section="Export" back>
      <Stack.Screen options={{ title: 'Export data' }} />

      <Text style={styles.section}>BACKUP</Text>
      <Text style={styles.muted}>
        One file with everything, photos included, to keep somewhere safe — Drive, Files or an
        email to yourself. Uninstalling the app deletes everything on the phone; this file brings
        it back, here or on a new phone.
      </Text>
      <BackupButton />
      <RestoreButton />

      <Text style={styles.section}>EXPORT</Text>
      <Text style={styles.muted}>
        Everything you have logged, for other apps and spreadsheets: workouts, sets, food, water,
        weight, cardio, injury log, settings and coach threads. The JSON is complete and can also be
        restored; the CSVs are one table each. Photos are listed but not included — use the
        backup for those.
      </Text>
      <Text style={styles.muted}>
        Bundled exercise and food reference data is left out — it ships with the app and is not
        yours. API keys are never included; they live in the phone&apos;s secure storage, not with your data.
      </Text>

      <Pressable style={[styles.button, busy && styles.buttonBusy]} onPress={onExport} disabled={busy}>
        {busy ? (
          <ActivityIndicator color={colors.chipActiveText} />
        ) : (
          <Text style={styles.buttonText}>{result ? 'Export again' : 'Export my data'}</Text>
        )}
      </Pressable>

      {result ? (
        <>
          <Text style={styles.section}>
            {result.folderName} · {result.totalRows} rows
          </Text>
          {result.files.map((f) => (
            <Pressable key={f.uri} style={styles.card} onPress={() => onShare(f.uri, f.mimeType)}>
              <View style={styles.rowBetween}>
                <Text style={styles.fileName}>{f.name}</Text>
                <Text style={styles.link}>Share →</Text>
              </View>
              <Text style={styles.muted}>
                {f.rows == null ? 'Complete export' : `${f.rows} rows`}
                {f.size != null ? ` · ${formatSize(f.size)}` : ''}
              </Text>
            </Pressable>
          ))}
          <Text style={styles.muted}>
            Files are saved on this device under exports/{result.folderName}. Tap one to send it
            somewhere you control.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  muted: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.sm, lineHeight: 19 },
  section: {
    color: colors.text,
    fontWeight: '800',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    letterSpacing: 1,
  },
  button: {
    backgroundColor: colors.chipActive,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonBusy: { opacity: 0.7 },
  buttonText: { color: colors.chipActiveText, fontWeight: '900', letterSpacing: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fileName: { color: colors.text, fontWeight: '700', fontSize: 14 },
  link: { color: colors.accent, fontWeight: '700', fontSize: 13 },
}));
