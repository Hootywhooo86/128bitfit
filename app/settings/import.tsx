import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Label, MenuRow, Note, Screen } from '@/components/ui';
import { importSets, type ImportOutcome } from '@/db/import-sets';
import { parseImport, type ImportReport } from '@/lib/import/parse';
import { colors, fonts, radius, spacing } from '@/lib/theme';

/**
 * Import a training history from another app.
 *
 * Two steps on purpose: read the file and show what was found, then write. A
 * history import is not reversible from inside the app, so the user sees the
 * count and every unreadable row before anything touches the database.
 */
export default function ImportScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<(ImportReport & { filename: string }) | null>(null);
  const [done, setDone] = useState<ImportOutcome | null>(null);

  const choose = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setReport(null);
    setDone(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const text = new File(asset.uri).textSync();
      const parsed = parseImport(asset.name ?? '', text);
      if ('error' in parsed) {
        setError(parsed.error);
        return;
      }
      setReport({ ...parsed, filename: asset.name ?? 'file' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!report || busy) return;
    setBusy(true);
    try {
      setDone(await importSets(report.sets));
      setReport(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The import failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen section="Import" back>
      <Label>IMPORT A HISTORY</Label>
      <Note>
        Bring your training across from another app. Sets are matched to the exercise library by
        name; anything unmatched is kept under the name the file used, so nothing is lost.
      </Note>

      <View style={{ height: spacing.md }} />
      <MenuRow
        icon="▤"
        name="Hevy export (CSV)"
        sub="Hevy → Settings → Export data"
        onPress={() => void choose()}
      />
      <MenuRow icon="▦" name="Any CSV of sets" sub="Needs a date and an exercise column" onPress={() => void choose()} />
      <MenuRow icon="⌗" name="JSON export" sub="This app's export, or an array of sets" onPress={() => void choose()} />

      {busy ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : null}

      {error ? (
        <Card>
          <Text style={s.err}>{error}</Text>
        </Card>
      ) : null}

      {report ? (
        <>
          <Label>FOUND</Label>
          <Card>
            <Text style={s.big}>{report.sets.length}</Text>
            <Text style={s.sub}>
              sets in {report.filename} ({report.format})
            </Text>
            <Text style={s.sub}>
              {new Set(report.sets.map((x) => x.exerciseName)).size} exercises ·{' '}
              {new Set(report.sets.map((x) => x.date)).size} days
            </Text>

            {report.skipped.length > 0 ? (
              <View style={s.skipped}>
                <Text style={s.skippedH}>
                  {report.skipped.length} row{report.skipped.length === 1 ? '' : 's'} could not be
                  read
                </Text>
                {report.skipped.slice(0, 8).map((sk) => (
                  <Text key={sk.row} style={s.skippedL}>
                    line {sk.row}: {sk.reason}
                  </Text>
                ))}
                {report.skipped.length > 8 ? (
                  <Text style={s.skippedL}>…and {report.skipped.length - 8} more</Text>
                ) : null}
              </View>
            ) : null}
          </Card>

          <Pressable style={s.primary} onPress={() => void commit()}>
            <Text style={s.primaryT}>IMPORT {report.sets.length} SETS</Text>
          </Pressable>
        </>
      ) : null}

      {done ? (
        <>
          <Label>DONE</Label>
          <Card>
            <Text style={s.big}>{done.setsAdded}</Text>
            <Text style={s.sub}>
              sets across {done.sessionsAdded} sessions · {done.exercisesCreated} new exercises
            </Text>
            {done.duplicatesSkipped > 0 ? (
              <Text style={s.sub}>
                {done.duplicatesSkipped} already imported, left alone
              </Text>
            ) : null}
          </Card>
          <Pressable style={s.primary} onPress={() => router.replace('/(tabs)/train')}>
            <Text style={s.primaryT}>OPEN TRAIN</Text>
          </Pressable>
        </>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: 24, alignItems: 'center' },
  err: { color: colors.danger, fontSize: 13, lineHeight: 19, fontFamily: fonts.body },
  big: { color: colors.text, fontSize: 30, fontFamily: fonts.bodyBold, letterSpacing: -1 },
  sub: { color: colors.textMuted, fontSize: 13, marginTop: 4, fontFamily: fonts.body },
  skipped: {
    marginTop: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.borderBright,
    paddingLeft: 11,
  },
  skippedH: { color: colors.text, fontSize: 12.5, fontFamily: fonts.bodySemi },
  skippedL: { color: colors.textDim, fontSize: 12, marginTop: 3, fontFamily: fonts.body },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryT: { fontFamily: fonts.pixel, fontSize: 10, color: colors.onAccent, letterSpacing: 1 },
});
