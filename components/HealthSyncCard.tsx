/**
 * What Health Connect is actually doing right now.
 *
 * Two jobs. First, it answers "is this working?" with the live grant list
 * rather than a promise — a user who ticked six of the twenty-seven boxes
 * should be able to see which six. Second, it is where a failed background
 * sync surfaces: lib/health/mirror.ts pushes logs after the local write and
 * never blocks the UI, so without somewhere to report a failure that push
 * would be exactly the silent no-op the house style forbids.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { health } from '@/lib/health';
import {
  clearMirrorFailure,
  lastMirrorFailure,
  subscribeMirror,
  type MirrorFailure,
} from '@/lib/health/mirror';
import { HEALTH_SCOPES, type HealthGrants, type HealthScope } from '@/lib/health/types';
import { colors, spacing } from '@/lib/theme';

/** Plain names, because "restingHeartRate" is our word, not the user's. */
const SCOPE_LABEL: Record<HealthScope, string> = {
  steps: 'steps',
  heartRate: 'heart rate',
  restingHeartRate: 'resting heart rate',
  activeCalories: 'active calories',
  totalCalories: 'total calories',
  distance: 'distance',
  sleep: 'sleep',
  weight: 'weight',
  height: 'height',
  bodyFat: 'body fat',
  exercise: 'workouts',
  nutrition: 'food',
  hydration: 'water',
  oxygenSaturation: 'blood oxygen',
  respiratoryRate: 'breathing rate',
  vo2Max: 'VO₂ max',
  bloodPressure: 'blood pressure',
  basalMetabolicRate: 'basal metabolic rate',
};

const names = (scopes: HealthScope[]) =>
  HEALTH_SCOPES.filter((s) => scopes.includes(s))
    .map((s) => SCOPE_LABEL[s])
    .join(', ');

type Status =
  | { kind: 'checking' }
  | { kind: 'unavailable' }
  | { kind: 'update' }
  | { kind: 'grants'; grants: HealthGrants };

export function HealthSyncCard() {
  const [status, setStatus] = React.useState<Status>({ kind: 'checking' });
  const [failure, setFailure] = React.useState<MirrorFailure | null>(lastMirrorFailure);

  const refresh = React.useCallback(async () => {
    const availability = await health.getAvailability();
    if (availability === 'unavailable') return setStatus({ kind: 'unavailable' });
    if (availability === 'update_required') return setStatus({ kind: 'update' });
    setStatus({ kind: 'grants', grants: await health.getGrants() });
  }, []);

  React.useEffect(() => {
    void refresh().catch(() => setStatus({ kind: 'unavailable' }));
    return subscribeMirror(setFailure);
  }, [refresh]);

  const connect = async () => {
    await health.requestPermissions();
    await refresh();
  };

  return (
    <View style={styles.card}>
      <Text style={styles.h}>Connection</Text>

      {status.kind === 'checking' ? (
        <Text style={styles.body}>Checking…</Text>
      ) : status.kind === 'unavailable' ? (
        <Text style={styles.body}>
          Health Connect is not available on this phone. Everything in the app still works;
          steps, sleep and readiness simply have nowhere to come from.
        </Text>
      ) : status.kind === 'update' ? (
        <Text style={styles.body}>
          Health Connect is installed but needs updating before this app can talk to it.
        </Text>
      ) : status.grants.read.length === 0 && status.grants.write.length === 0 ? (
        <>
          <Text style={styles.body}>
            Not connected. Nothing is read and nothing is written until you allow it.
          </Text>
          <Pressable style={styles.button} onPress={() => void connect()}>
            <Text style={styles.buttonText}>Connect Health Connect</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.body}>
            <Text style={styles.bold}>Reading:</Text>{' '}
            {status.grants.read.length > 0 ? names(status.grants.read) : 'nothing'}
          </Text>
          <Text style={styles.body}>
            <Text style={styles.bold}>Writing:</Text>{' '}
            {status.grants.write.length > 0 ? names(status.grants.write) : 'nothing'}
          </Text>
          <Text style={styles.small}>
            Anything not listed was not granted, and the app leaves it alone rather than
            working around it.
          </Text>
          <Pressable style={styles.button} onPress={() => void connect()}>
            <Text style={styles.buttonText}>Review permissions</Text>
          </Pressable>
        </>
      )}

      {failure ? (
        <View style={styles.error}>
          <Text style={styles.errorText}>
            Could not send {failure.what} to Health Connect. {failure.message}
          </Text>
          <Text style={styles.small}>
            It is saved in the app either way — only the copy in Health Connect is missing.
          </Text>
          <Pressable onPress={clearMirrorFailure}>
            <Text style={styles.dismiss}>Dismiss</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  h: { color: colors.text, fontWeight: '800', fontSize: 15, marginBottom: 8 },
  body: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 6 },
  bold: { color: colors.text, fontWeight: '700' },
  small: { color: colors.textDim, fontSize: 11.5, lineHeight: 16, marginTop: 4 },
  button: {
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.borderBright,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  error: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  errorText: { color: colors.danger, fontSize: 12.5, lineHeight: 18 },
  dismiss: { color: colors.textMuted, fontSize: 12, marginTop: 8, fontWeight: '700' },
});
