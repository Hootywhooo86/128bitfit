import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { SportPicker } from '@/components/SportPicker';
import { Label, MenuRow, Note, Screen, SessionCard } from '@/components/ui';
import { getOpenCardioSession, listCardioSessions } from '@/db/cardio-queries';
import { getCardioSettings } from '@/db/map-settings';
import type { CardioSession } from '@/db/schema';
import { getAppSettings } from '@/db/settings-queries';
import {
  DEFAULT_SPORT,
  distanceUnitFor,
  formatDistance,
  formatDuration,
  sportById,
  type DistanceUnit,
  type SportId,
} from '@/lib/cardio';
import { colors, fonts, themedStyles } from '@/lib/theme';

/**
 * Cardio: start one, pick up one that is still recording, and see past ones.
 *
 * Start → choose the sport → the map. Indoor sports skip the map and go to a
 * form, because there is no route to show.
 */
export default function CardioHomeScreen() {
  const router = useRouter();
  const [open, setOpen] = useState<CardioSession | null>(null);
  const [history, setHistory] = useState<CardioSession[]>([]);
  const [unit, setUnit] = useState<DistanceUnit>('km');
  const [lastSport, setLast] = useState<SportId>(DEFAULT_SPORT);
  const [picking, setPicking] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        const [o, h, app, cs] = await Promise.all([
          getOpenCardioSession(),
          listCardioSessions(),
          getAppSettings(),
          getCardioSettings(),
        ]);
        setOpen(o);
        setHistory(h);
        setUnit(distanceUnitFor(app.units));
        setLast(cs.lastSport);
        setLoaded(true);
      })();
    }, [])
  );

  const go = (id: SportId) => {
    const sp = sportById(id);
    router.push({ pathname: sp.gps ? '/cardio/record' : '/cardio/manual', params: { sport: sp.id } });
  };

  return (
    <Screen section="Cardio" back>
      {open ? (
        <SessionCard
          title={open.status === 'paused' ? 'PAUSED' : 'RECORDING'}
          sub={`${sportById(open.sport).label} · started ${new Date(open.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
          action="OPEN"
          onPress={() => router.push({ pathname: '/cardio/record', params: { sport: open.sport } })}
        />
      ) : (
        <SessionCard
          title="START CARDIO"
          sub="Choose walk, run, ride and more — then the map"
          action="CHOOSE"
          onPress={() => setPicking(true)}
        />
      )}

      {!open ? (
        <>
          <Label>QUICK START</Label>
          <MenuRow
            icon={sportById(lastSport).badge}
            name={sportById(lastSport).label}
            sub="Your last sport"
            onPress={() => go(lastSport)}
          />
          <MenuRow icon="✎" name="Log by hand" sub="Treadmill or indoor ride: time and distance" onPress={() => go('treadmill')} />
        </>
      ) : null}

      <Label>HISTORY</Label>
      {loaded && history.length === 0 ? (
        <Note>No cardio yet. Start one above and it shows up here with its route.</Note>
      ) : null}
      {history.map((h) => {
        const sp = sportById(h.sport);
        const when = new Date(h.startedAt);
        const bits = [
          h.distanceM != null && h.distanceM > 0 ? `${formatDistance(h.distanceM, unit)} ${unit}` : null,
          h.movingS != null ? formatDuration(h.movingS) : null,
        ].filter(Boolean);
        return (
          <MenuRow
            key={h.id}
            icon={sp.badge}
            name={sp.label}
            sub={`${when.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
            value={bits.join(' · ') || undefined}
            onPress={() => router.push({ pathname: '/cardio/[id]', params: { id: h.id } })}
          />
        );
      })}

      <Text style={s.credit}>Maps © OpenStreetMap contributors · OpenFreeMap</Text>

      <SportPicker
        visible={picking}
        selected={lastSport}
        onClose={() => setPicking(false)}
        onPick={(sp) => {
          setPicking(false);
          go(sp.id);
        }}
      />
    </Screen>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    credit: { color: colors.textDim, fontSize: 11, textAlign: 'center', marginTop: 24, fontFamily: fonts.body },
  })
);
