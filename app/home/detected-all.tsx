import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { DetectedStateNote, detectedSub, openDetected } from '@/components/DetectedWorkouts';
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
    void getDetectedWorkouts({ days: DAYS })
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
                sub={detectedSub(w, sourceName(w.source))}
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
                  sub={detectedSub(h.session, HIDDEN_REASON_TEXT[h.reason])}
                  value={h.reason === 'dismissed' ? 'Show' : undefined}
                  onPress={() => onHidden(h)}
                />
              ))}
            </>
          )}

          <Note>
            {Platform.OS === 'ios'
              ? "Still missing one? It shows here once it has reached Apple Health. A workout from another app's watch (Garmin, Google Health…) only arrives after that app syncs, so open it to push it through. Apple Health also never says whether 128BIT FIT is allowed to read workouts — if none ever appear, check Health → Sharing → Apps → 128BIT FIT iOS."
              : "Still missing one? It shows here once your watch's app has synced it to Health Connect, so open that app (Google Health, Samsung Health…) to push it through. Health Connect also only shares workouts from up to 30 days before you first connected 128BIT FIT."}
          </Note>
        </>
      )}
    </Screen>
  );
}
