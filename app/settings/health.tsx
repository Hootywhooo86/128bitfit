import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Card, Note, Screen } from '@/components/ui';
import { diagnoseHealth, health } from '@/lib/health';
import { formatReport, type DiagnosticStep } from '@/lib/health/diagnose';
import { colors, fonts, spacing } from '@/lib/theme';
import { HEALTH_APP } from '@/lib/health/platform';

/**
 * What Health Connect actually reports, step by step.
 *
 * The Home card has to collapse every failure into "not connected", which is
 * the right thing to tell someone standing in a gym and useless for working
 * out why. A refused permission, an initialize() that returned false and an
 * initialize() that threw all look identical there, and only the first is
 * fixed by granting permission.
 *
 * This runs the same sequence with nothing swallowed and names the step that
 * failed, so a bug report is a fact rather than a dash.
 */
export default function HealthDiagnosticsScreen() {
  const [steps, setSteps] = useState<DiagnosticStep[] | null>(null);

  const run = useCallback(async () => {
    setSteps(null);
    setSteps(await diagnoseHealth());
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads data when the screen opens; the state it sets is the result of that read
    void run();
  }, [run]);

  // Share rather than a clipboard dependency: it is core React Native, so this
  // screen does not add a native module to the build, and it goes straight
  // into a message.
  const send = async () => {
    if (!steps) return;
    try {
      await Share.share({ message: formatReport(steps) });
    } catch {
      // Dismissing the sheet is not an error, and the text above is
      // selectable anyway.
    }
  };

  return (
    <Screen section={HEALTH_APP} back onRefresh={() => void run()}>
      <Note>
        Each line is one step of reading today&apos;s steps. A line marked XX is the one that
        failed — everything below it did not run.
      </Note>

      {steps == null ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <>
          <Card>
            {steps.map((step, i) => (
              <View key={`${step.label}-${i}`} style={s.row}>
                <Text style={[s.mark, step.ok === false && s.bad, step.ok === true && s.good]}>
                  {step.ok === null ? '·' : step.ok ? '✓' : '✕'}
                </Text>
                <View style={s.text}>
                  <Text style={s.label}>{step.label}</Text>
                  {/* selectable so a value can be copied without the whole report */}
                  <Text style={s.value} selectable>
                    {step.value}
                  </Text>
                </View>
              </View>
            ))}
          </Card>

          <Pressable style={s.btn} onPress={() => void send()}>
            <Text style={s.btnT}>Send report</Text>
          </Pressable>

          <Pressable style={s.btn} onPress={() => void run()}>
            <Text style={s.btnT}>Run again</Text>
          </Pressable>

          <Pressable style={s.btn} onPress={() => health.openSettings()}>
            <Text style={s.btnT}>Open {HEALTH_APP}</Text>
          </Pressable>
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  center: { paddingVertical: 60, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  mark: { width: 14, color: colors.textDim, fontSize: 13, fontFamily: fonts.bodySemi },
  good: { color: colors.textMuted },
  bad: { color: colors.danger },
  text: { flex: 1, minWidth: 0 },
  label: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.body },
  value: { color: colors.text, fontSize: 13, fontFamily: fonts.body, marginTop: 2 },
  btn: {
    marginTop: spacing.sm,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnT: { color: colors.text, fontSize: 14, fontFamily: fonts.bodySemi },
});
