import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { DetectedStateNote, detectedMinutes, detectedWhen, openDetected } from '@/components/DetectedWorkouts';
import { Label, MenuRow, Note, Screen } from '@/components/ui';
import { getDetectedWorkouts, undismissDetected, type DetectedState, type HiddenDetected } from '@/db/detected-queries';
import { HIDDEN_REASON_TEXT, sourceName, workoutTypeName } from '@/lib/detected-workouts';

const DAYS = 30;

/**
 * Every workout Health Connect has from your watch and other apps in the last
 * 30 days. The ones held back from Home are listed too, each with the reason,
 * so a workout is never just missing.
 */
export default function DetectedAllScreen() {
  const router = useRouter();
  const [state, setState] = useState<DetectedState | null>(null);

  const load = useCallback(() => {
    // No per-workout readings here: thirty days of heart-rate reads would hit
    // Health Connect's rate limit. Each one's are read when it is opened.
    void getDetectedWorkouts({ days: DAYS, readings: 0 })
      .then(setState)
      .catch((e) => setState({ status: 'error', message: e instanceof Error ? e.message : String(e) }));
  }, []);
  useFocusEffect(load);

  const onHidden = (h: HiddenDetected) => {
    if (h.reason !== 'dismissed') {
      openDetected(router, h.session);
      return;
    }
    Alert.alert('Show it again?', 'It goes back in your detected workouts.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Show it',
        onPress: () => {
          undismissDetected(h.session.id)
            .then(load)
            .catch((e) => Alert.alert('Could not show it', e instanceof Error ? e.message : String(e)));
        },
      },
    ]);
  };

  return (
    <Screen section="Detected workouts" back>
      {!state ? null : state.status !== 'ready' ? (
        <DetectedStateNote state={state} />
      ) : (
        <>
          <Label>LAST {DAYS} DAYS</Label>
          {state.workouts.length === 0 ? (
            <Note>Nothing from your watch or other apps in the last {DAYS} days that you haven&apos;t already logged here.</Note>
          ) : (
            state.workouts.map((w) => (
              <MenuRow
                key={w.id}
                icon="◉"
                name={workoutTypeName(w.type, w.title)}
                sub={[detectedWhen(w), detectedMinutes(w), sourceName(w.source)].join(' · ')}
                onPress={() => openDetected(router, w)}
              />
            ))
          )}

          {state.hidden.length > 0 && (
            <>
              <Label>HELD BACK</Label>
              {state.hidden.map((h) => (
                <MenuRow
                  key={h.session.id}
                  icon="○"
                  name={workoutTypeName(h.session.type, h.session.title)}
                  sub={[detectedWhen(h.session), detectedMinutes(h.session), HIDDEN_REASON_TEXT[h.reason]].join(' · ')}
                  value={h.reason === 'dismissed' ? 'Show' : undefined}
                  onPress={() => onHidden(h)}
                />
              ))}
            </>
          )}

          <Note>
            Still missing one? It shows here once your watch&apos;s app has synced it to Health Connect, so open
            that app (Fitbit, Samsung Health…) to push it through. Health Connect also only shares workouts from
            up to 30 days before you first connected 128BIT FIT.
          </Note>
        </>
      )}
    </Screen>
  );
}
