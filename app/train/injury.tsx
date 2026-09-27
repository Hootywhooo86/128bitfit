import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { ToggleRow } from '@/components/ToggleRow';
import { Label, MenuRow, Note, Screen } from '@/components/ui';
import { useDb } from '@/db/DatabaseProvider';
import { getTellCoach, listInjuries, setTellCoach } from '@/db/injury-queries';
import type { Injury } from '@/db/schema';
import { colors, fonts } from '@/lib/theme';

const SEVERITY: Record<Injury['severity'], string> = { mild: 'Mild', moderate: 'Moderate', severe: 'Severe' };

const since = (d: Date) => d.toLocaleDateString([], { day: 'numeric', month: 'short' });

/** Train → Pain & injury log, from prototype/app-shell.html `train:injury`. */
export default function InjuryLogScreen() {
  const { ready } = useDb();
  const router = useRouter();
  const [data, setData] = useState<{ active: Injury[]; resolved: Injury[] } | null>(null);
  const [tellCoach, setTell] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      void Promise.all([listInjuries(), getTellCoach()])
        .then(([d, t]) => {
          setData(d);
          setTell(t);
        })
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
    }, [ready])
  );

  const open = (id?: string) =>
    router.push({ pathname: '/train/injury-edit', params: id ? { id } : {} });

  return (
    <Screen section="Pain & injury" back>
      <Note>Tell the app what hurts and the coach works around it.</Note>
      {error ? <Text style={{ color: colors.danger, marginTop: 8, fontFamily: fonts.body }}>{error}</Text> : null}

      <Label>ACTIVE</Label>
      {data?.active.map((i) => (
        <MenuRow
          key={i.id}
          name={i.area}
          sub={`Since ${since(i.startedAt)}${i.avoid ? ` · avoiding ${i.avoid}` : ''}`}
          value={SEVERITY[i.severity]}
          onPress={() => open(i.id)}
        />
      ))}
      {data && data.active.length === 0 ? (
        <Text style={{ color: colors.textDim, marginBottom: 10, fontFamily: fonts.body }}>
          Nothing logged as hurting.
        </Text>
      ) : null}
      <MenuRow icon="+" name="Log something new" sub="Area, severity, what makes it worse" onPress={() => open()} />

      <Label>WHAT CHANGES</Label>
      <ToggleRow
        name="Tell the coach"
        sub="Active entries go into the coach's summary so it works around them"
        value={tellCoach}
        onChange={(v) => {
          setTell(v);
          void setTellCoach(v).catch(() => setTell(!v));
        }}
      />

      {data && data.resolved.length > 0 ? (
        <>
          <Label>RESOLVED</Label>
          {data.resolved.map((i) => (
            <MenuRow
              key={i.id}
              name={i.area}
              sub={`${since(i.startedAt)} – ${since(i.resolvedAt!)}`}
              onPress={() => open(i.id)}
            />
          ))}
        </>
      ) : null}

      <View style={{ height: 10 }} />
      <Note>
        This is a training aid, not a diagnosis. If something hurts for more than a couple of weeks
        or is getting worse, see a physio — no app should be the one managing that.
      </Note>
    </Screen>
  );
}
