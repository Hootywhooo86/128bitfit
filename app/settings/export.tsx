import { Stack } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Sharing from 'expo-sharing';
import { runExport, type ExportResult } from '@/lib/export';
import { colors, spacing } from '@/lib/theme';
import { Screen } from '@/components/ui';

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

      <Text style={styles.muted}>
        Everything you have logged: workouts, sets, food, water, weight, settings and coach
        threads. JSON is the complete, re-importable copy; the CSVs are one table each for
        spreadsheets.
      </Text>
      <Text style={styles.muted}>
        Bundled exercise and food reference data is left out — it ships with the app and is not
        yours. API keys are never included; they live in Secure Store, not the database.
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

const styles = StyleSheet.create({
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
});
