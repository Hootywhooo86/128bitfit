import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Label, MenuRow, Note, Screen } from '@/components/ui';
import { importExtras, type ExtrasOutcome } from '@/db/import-extras';
import { importSets, type ImportOutcome } from '@/db/import-sets';
import type { OpenGymReport } from '@/lib/import/opengym';
import { parseImport, type ImportExtras, type ImportReport } from '@/lib/import/parse';
import { colors, fonts, radius, spacing, themedStyles } from '@/lib/theme';

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
  const [report, setReport] = useState<
    (ImportReport & { filename: string; openGym?: OpenGymReport }) | null
  >(null);
  const [done, setDone] = useState<ImportOutcome | null>(null);
  const [doneExtras, setDoneExtras] = useState<ExtrasOutcome | null>(null);

  const choose = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setReport(null);
    setDone(null);
    setDoneExtras(null);
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
      // Routines, custom exercises and weigh-ins, when the file had them.
      // After the sets, so a routine links to an exercise the history has
      // already created rather than making a second row for the same name.
      if (report.extras) setDoneExtras(await importExtras(report.extras));
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
      <MenuRow
        icon="⌗"
        name="JSON export"
        sub="openGym backup — history, routines, custom exercises and weigh-ins"
        onPress={() => void choose()}
      />

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

            {report.extras ? <ExtrasFound extras={report.extras} og={report.openGym} /> : null}

            {report.openGym && report.openGym.unnamedIds.length > 0 ? (
              <View style={s.skipped}>
                <Text style={s.skippedH}>
                  {report.openGym.unnamedIds.length} exercises come in numbered
                </Text>
                <Text style={s.skippedL}>
                  openGym&apos;s backup stores its built-in exercises by id and does not include
                  their names, so they import as &quot;openGym 0218&quot; and so on. Every set,
                  date, weight and rep is kept — rename them in the library when you spot them.
                </Text>
                <Text style={s.skippedL}>
                  {report.openGym.namedCount} of your own custom exercises keep their names.
                </Text>
              </View>
            ) : null}

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
            <Text style={s.primaryT}>
              IMPORT {report.sets.length} SETS
              {report.extras && report.extras.routines.length > 0
                ? ` + ${report.extras.routines.length} ROUTINES`
                : ''}
            </Text>
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
            {doneExtras ? <ExtrasDone done={doneExtras} /> : null}
          </Card>
          <Pressable style={s.primary} onPress={() => router.replace('/(tabs)/train')}>
            <Text style={s.primaryT}>OPEN TRAIN</Text>
          </Pressable>
        </>
      ) : null}
    </Screen>
  );
}

/**
 * What else is in the file besides sets.
 *
 * Listed before the import runs, because a routine is a different kind of thing
 * from a logged set and the user should know both are coming. Only what is
 * actually there is mentioned — a file with no routines says nothing about
 * routines rather than reporting a zero.
 */
function ExtrasFound({ extras, og }: { extras: ImportExtras; og?: OpenGymReport }) {
  const lines: string[] = [];
  if (extras.routines.length > 0) {
    const n = extras.routines.reduce((t, r) => t + r.exercises.length, 0);
    lines.push(`${extras.routines.length} routines · ${n} exercises between them`);
  }
  if (extras.exercises.length > 0) lines.push(`${extras.exercises.length} exercises you created`);
  if (extras.weights.length > 0) lines.push(`${extras.weights.length} weigh-ins`);
  if (lines.length === 0) return null;

  return (
    <View style={s.skipped}>
      <Text style={s.skippedH}>Also in this file</Text>
      {lines.map((l) => (
        <Text key={l} style={s.skippedL}>
          {l}
        </Text>
      ))}
      {extras.routines.length > 0 ? (
        <Text style={s.skippedL}>
          {extras.routines.map((r) => r.name).join(', ')}
        </Text>
      ) : null}
      {og && og.exercisesWithoutMuscles > 0 ? (
        <Text style={s.skippedL}>
          {og.exercisesWithoutMuscles} of them have no muscles recorded in the backup. They come
          in blank rather than guessed — tag them in the library and they start colouring the
          muscle map.
        </Text>
      ) : null}
      <Text style={s.skippedL}>
        Routines are plans, not training. They will not appear on the muscle map until you run
        one.
      </Text>
    </View>
  );
}

/** The same again, after the write, reporting what actually landed. */
function ExtrasDone({ done }: { done: ExtrasOutcome }) {
  const lines: string[] = [];
  if (done.routinesAdded > 0) lines.push(`${done.routinesAdded} routines added`);
  if (done.routinesSkipped > 0) {
    lines.push(`${done.routinesSkipped} routines already had that name, left alone`);
  }
  if (done.exercisesFilledIn > 0) {
    lines.push(`${done.exercisesFilledIn} exercises gained the muscles they were missing`);
  }
  if (done.weightsAdded > 0) lines.push(`${done.weightsAdded} weigh-ins added`);
  if (done.weightsSkipped > 0) lines.push(`${done.weightsSkipped} weigh-ins already recorded`);
  if (lines.length === 0) return null;

  return (
    <View style={s.skipped}>
      {lines.map((l) => (
        <Text key={l} style={s.skippedL}>
          {l}
        </Text>
      ))}
    </View>
  );
}

const s = themedStyles(() => StyleSheet.create({
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
  primaryT: { fontFamily: fonts.pixel, fontSize: 7, color: colors.onAccent, letterSpacing: 0.7 },
}));
