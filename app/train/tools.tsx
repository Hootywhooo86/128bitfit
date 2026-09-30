import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Label, MenuRow, Screen } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { listActiveInjuries } from '@/db/injury-queries';
import { getRestPrefs } from '@/db/rest-settings';

/**
 * The less-used Train tools, one tap down, so the Train tab leads with what is
 * done every session: start, routines, history.
 */
export default function TrainToolsScreen() {
  const router = useRouter();
  const { ready } = useDb();
  const [restSecs, setRestSecs] = useState<number | null>(null);
  const [activeInjuries, setActiveInjuries] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      void Promise.all([getRestPrefs(), listActiveInjuries()]).then(([rest, hurts]) => {
        setRestSecs(rest.defaultSeconds);
        setActiveInjuries(hurts.length);
      });
    }, [ready])
  );

  return (
    <Screen section="Tools" back>
      <Label>AT THE BAR</Label>
      <MenuRow
        icon="◉"
        name="Plate calculator"
        sub="What to put on each side of the bar"
        onPress={() => router.push('/train/plates')}
      />
      <MenuRow
        icon="▲"
        name="Warm-up sets"
        sub="Ramp to your working weight"
        onPress={() => router.push('/train/warmup')}
      />
      <MenuRow
        icon="◷"
        name="Rest timer"
        sub="Default length, sound, vibration"
        value={restSecs != null ? `${restSecs}s` : undefined}
        onPress={() => router.push('/train/timer')}
      />

      <Label>BODY</Label>
      <MenuRow
        icon="◐"
        name="Readiness"
        sub="Sleep and heart rate"
        onPress={() => router.push('/train/readiness')}
      />
      <MenuRow
        icon="▣"
        name="Progress photos"
        sub="On this phone only"
        onPress={() => router.push('/train/photos')}
      />
      <MenuRow
        icon="✛"
        name="Pain & injury log"
        sub={activeInjuries > 0 ? `${activeInjuries} active` : 'Nothing logged'}
        onPress={() => router.push('/train/injury')}
      />
    </Screen>
  );
}
