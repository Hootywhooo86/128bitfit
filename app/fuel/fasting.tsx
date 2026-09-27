import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNow } from '@/components/FastingCard';
import { Bar, Card, Label, Note, Screen } from '@/components/ui';
import { FAST_PLANS, fastProgress, formatElapsed } from '@/lib/fasting';
import { endFast, startFast, useFast } from '@/lib/fasting-store';
import { colors, fonts, radius, spacing, themedStyles } from '@/lib/theme';

/**
 * The fasting timer, from prototype/app-shell.html `fuel:fasting`.
 *
 * Off until started. While it runs, Fuel shows the clock at the top.
 */
export default function FastingScreen() {
  const { loaded, fast } = useFast();
  const now = useNow(fast != null);
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const start = async (hours: number) => {
    if (busy) return;
    setBusy(true);
    try {
      setWarning(await startFast(hours));
    } catch (e) {
      Alert.alert('Could not start the fast', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    if (busy || !fast) return;
    setBusy(true);
    try {
      const lasted = formatElapsed(fastProgress(fast, Date.now()).elapsedMs);
      await endFast();
      setWarning(null);
      Alert.alert('Fast ended', `${lasted} in total.`);
    } catch (e) {
      Alert.alert('Could not end the fast', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <Screen section="Fasting timer" back>{null}</Screen>;

  if (!fast) {
    return (
      <Screen section="Fasting timer" back>
        <Text style={s.hero}>Off until you start it. Kept on this phone only.</Text>
        <Label>PICK A WINDOW</Label>
        {FAST_PLANS.map((p) => (
          <Pressable
            key={p.hours}
            style={({ pressed }) => [s.opt, pressed && s.optPressed, busy && { opacity: 0.5 }]}
            onPress={() => void start(p.hours)}
            disabled={busy}
          >
            <View style={{ flex: 1 }}>
              <Text style={s.optN}>{p.name}</Text>
              <Text style={s.optS}>{p.detail}</Text>
            </View>
            <Text style={s.optGo}>Start</Text>
          </Pressable>
        ))}
        <View style={{ height: spacing.md }} />
        <Note>
          A timer, not a diet plan. If you have a history of disordered eating, or you are pregnant,
          diabetic or on medication that needs food, this is one to talk to a doctor about rather
          than an app.
        </Note>
      </Screen>
    );
  }

  const p = fastProgress(fast, now);
  return (
    <Screen section="Fasting timer" back>
      <Card style={s.clockCard}>
        <Text style={s.clockL}>ELAPSED</Text>
        <Text style={s.clock}>{formatElapsed(p.elapsedMs)}</Text>
        <Text style={s.clockS}>
          of {fast.hours}h · {p.complete ? 'window complete' : `${formatElapsed(p.remainingMs)} to go`}
        </Text>
        <View style={{ marginTop: 16, alignSelf: 'stretch' }}>
          <Bar pct={p.pct} />
        </View>
        <Text style={s.started}>
          Started{' '}
          {new Date(fast.startedAt).toLocaleString([], {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </Text>
      </Card>
      {warning ? <Text style={s.warn}>{warning}</Text> : null}
      <Pressable
        style={({ pressed }) => [s.opt, pressed && s.optPressed, busy && { opacity: 0.5 }]}
        onPress={() => void end()}
        disabled={busy}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.optN}>End fast</Text>
          <Text style={s.optS}>Stops and clears the timer</Text>
        </View>
        <Text style={s.chev}>›</Text>
      </Pressable>
    </Screen>
  );
}

const s = themedStyles(() => StyleSheet.create({
  hero: { color: colors.textMuted, fontSize: 13, lineHeight: 19, fontFamily: fonts.body },
  opt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: 15,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  optPressed: { borderColor: colors.accent },
  optN: { fontSize: 15, fontFamily: fonts.bodySemi, color: colors.text },
  optS: { fontSize: 12.5, color: colors.textDim, marginTop: 4, fontFamily: fonts.body },
  optGo: { color: colors.accent, fontFamily: fonts.bodyBold, fontSize: 13 },
  chev: { color: colors.textDim, fontSize: 16 },
  clockCard: { alignItems: 'center', paddingVertical: 24 },
  clockL: { fontFamily: fonts.pixel, fontSize: 8, color: colors.textDim, letterSpacing: 1.5 },
  clock: {
    fontSize: 44,
    fontFamily: fonts.bodyBold,
    color: colors.text,
    letterSpacing: -2,
    marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  clockS: { fontSize: 13, color: colors.textMuted, marginTop: 6, fontFamily: fonts.body },
  started: { fontSize: 11.5, color: colors.textDim, marginTop: 12, fontFamily: fonts.body },
  warn: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginBottom: 10, fontFamily: fonts.body },
}));
