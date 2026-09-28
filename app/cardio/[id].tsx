import { File, Paths } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { HeartRateCard } from '@/components/HeartRateCard';
import { RouteMap } from '@/components/RouteMap';
import { Card, CardHead, Label, MenuRow, Note, Screen } from '@/components/ui';
import { deleteCardioSession, getCardioFixes, getCardioSession } from '@/db/cardio-queries';
import { getCardioSettings } from '@/db/map-settings';
import type { CardioSession } from '@/db/schema';
import {
  cardioStats,
  formatDistance,
  formatDuration,
  formatPace,
  formatSpeed,
  sportById,
  toGpx,
  type DistanceUnit,
  type Fix,
} from '@/lib/cardio';
import { offerBreakdown } from '@/lib/ai-breakdown';
import { mirrorWorkoutRemoved } from '@/lib/health/mirror';
import { useCardioEnergy } from '@/lib/health/use-cardio-energy';
import type { EnergyResult } from '@/lib/workout-energy';
import { MAP_ROUTE_BLUE, type MapStyleId } from '@/lib/map-style';
import { colors, fonts, spacing, themedStyles } from '@/lib/theme';

/** A finished cardio session: the route, the totals and the splits. */
export default function CardioSummaryScreen() {
  const router = useRouter();
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const [session, setSession] = useState<CardioSession | null | undefined>(undefined);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [unit, setUnit] = useState<DistanceUnit>('km');
  const [styleId, setStyleId] = useState<MapStyleId>('dark');
  const [colours, setColours] = useState({ dot: MAP_ROUTE_BLUE, line: MAP_ROUTE_BLUE });
  const [autoPause, setAutoPause] = useState(true);

  useEffect(() => {
    void (async () => {
      const [s, pts, cs] = await Promise.all([
        getCardioSession(String(id)),
        getCardioFixes(String(id)),
        getCardioSettings(),
      ]);
      setUnit(cs.distanceUnit);
      setStyleId(cs.mapStyle);
      setColours({ dot: cs.dotColour, line: cs.lineColour });
      setAutoPause(cs.autoPause);
      setFixes(pts);
      setSession(s);
      // Straight after Finish, not when opened from history.
      if (s && fresh === '1') void offerBreakdown(router, { cardioId: s.id });
    })();
  }, [id]);

  const sport = sportById(session?.sport);
  const stats = useMemo(() => cardioStats(fixes, sport, { autoPause, unit }), [fixes, sport, autoPause, unit]);
  const energy = useCardioEnergy(
    session
      ? {
          sport,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
          manual: session.manual,
          movingS: session.manual ? session.movingS : Math.round(stats.movingS),
          distanceM: session.manual ? session.distanceM : stats.distanceM,
          climbM: session.manual ? null : stats.elevGainM,
        }
      : null
  );

  if (session === undefined) {
    return (
      <Screen section="Cardio" back>
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      </Screen>
    );
  }
  if (session === null) {
    return (
      <Screen section="Cardio" back>
        <Note>This session no longer exists. It may have been deleted.</Note>
      </Screen>
    );
  }

  const unitLabel = unit === 'mi' ? 'mi' : 'km';
  const speedLabel = unit === 'mi' ? 'mph' : 'km/h';
  // Stored totals for a typed-in session; for a route, the route decides.
  const distanceM = session.manual ? session.distanceM : stats.distanceM;
  const movingS = session.manual ? session.movingS : Math.round(stats.movingS);
  const avgSpeed = distanceM && movingS ? distanceM / movingS : null;
  const hasPace = distanceM != null && distanceM >= 50 && movingS != null && movingS > 0;
  const started = new Date(session.startedAt);

  const shareGpx = async () => {
    try {
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing unavailable', 'This phone has no app to share files with.');
        return;
      }
      const stamp = started.toISOString().slice(0, 16).replace(/[:T]/g, '-');
      const file = new File(Paths.cache, `128bitfit-${sport.id}-${stamp}.gpx`);
      file.create({ overwrite: true });
      file.write(toGpx({ name: `${sport.label} · ${started.toLocaleDateString()}`, startedAt: session.startedAt }, fixes));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/gpx+xml', UTI: 'com.topografix.gpx' });
    } catch (e) {
      Alert.alert('Could not export the route', e instanceof Error ? e.message : String(e));
    }
  };

  const remove = () =>
    Alert.alert('Delete this session?', 'The route and its numbers are removed from this phone.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteCardioSession(session.id);
          mirrorWorkoutRemoved(session.id);
          router.back();
        },
      },
    ]);

  return (
    <Screen section={sport.label} back>
      <Text style={s.when}>
        {started.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })} ·{' '}
        {started.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      </Text>

      {fixes.length >= 2 ? (
        <View style={s.map}>
          <RouteMap
            fixes={fixes}
            here={null}
            styleId={styleId}
            follow={false}
            showEnds
            dotColour={colours.dot}
            lineColour={colours.line}
          />
        </View>
      ) : !session.manual ? (
        <Note>No route was recorded — the phone never got a usable GPS position.</Note>
      ) : null}

      <View style={s.grid}>
        <Big value={distanceM != null ? formatDistance(distanceM, unit) : '–'} label={`Distance (${unitLabel})`} />
        <Big value={movingS != null ? formatDuration(movingS) : '–'} label="Moving time" />
        {sport.showSpeed ? (
          <Big value={hasPace ? formatSpeed(avgSpeed, unit) : '–'} label={`Avg speed (${speedLabel})`} />
        ) : (
          <Big
            value={hasPace ? formatPace(movingS! / (distanceM! / (unit === 'mi' ? 1609.344 : 1000))) : '–:––'}
            label={`Avg pace (/${unitLabel})`}
          />
        )}
        <Big value={session.elapsedS != null ? formatDuration(session.elapsedS) : '–'} label="Elapsed" />
        {!session.manual ? (
          <Big
            value={stats.elevGainM != null ? String(Math.round(unit === 'mi' ? stats.elevGainM * 3.28084 : stats.elevGainM)) : '–'}
            label={`Climb (${unit === 'mi' ? 'ft' : 'm'})`}
          />
        ) : null}
      </View>

      {!session.manual && stats.splits.length > 0 ? (
        <>
          <Label>SPLITS</Label>
          <Card>
            <CardHead title={`PER ${unitLabel.toUpperCase()}`} note={sport.showSpeed ? speedLabel : 'pace'} />
            {stats.splits.map((sp) => (
              <View key={sp.n} style={s.splitRow}>
                <Text style={s.splitN}>
                  {sp.distanceM < (unit === 'mi' ? 1609 : 999) ? formatDistance(sp.distanceM, unit) : sp.n}
                </Text>
                <Text style={s.splitV}>
                  {sport.showSpeed
                    ? formatSpeed(sp.distanceM / sp.movingS, unit)
                    : formatPace(sp.movingS / (sp.distanceM / (unit === 'mi' ? 1609.344 : 1000)))}
                </Text>
                <Text style={s.splitT}>{formatDuration(sp.movingS)}</Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {!session.manual ? <HeartRateCard startedAt={session.startedAt} endedAt={session.endedAt} /> : null}

      <EnergyCard energy={energy} />

      <Label>COACH</Label>
      <MenuRow
        icon="◈"
        name="Ask the coach about this"
        sub="A debrief of this session, with your recent cardio and food"
        onPress={() => router.push({ pathname: '/coach/[mode]', params: { mode: 'debrief', cardio: session.id } })}
      />

      <Label>MORE</Label>
      {fixes.length >= 2 ? (
        <MenuRow icon="⇪" name="Export route (GPX)" sub="Open it in Strava, Komoot or any map app" onPress={() => void shareGpx()} />
      ) : null}
      <Pressable style={s.delete} onPress={remove}>
        <Text style={s.deleteT}>Delete session</Text>
      </Pressable>
    </Screen>
  );
}

/** Active calories, and whether they were measured or worked out — never shown the same way. */
function EnergyCard({ energy }: { energy: EnergyResult | null }) {
  if (!energy) return null;
  if (energy.status === 'unknown') {
    return (
      <Card>
        <CardHead title="CALORIES" />
        <Text style={s.energyNote}>
          No figure yet — needs {energy.missing.join(' and ')}.
          {energy.missing.includes('your body weight') ? ' Log a weigh-in and this fills in.' : ''}
        </Text>
      </Card>
    );
  }
  const measured = energy.status === 'measured';
  return (
    <Card>
      <CardHead title="ACTIVE CALORIES" note={measured ? 'measured' : 'estimate'} />
      <Text style={s.energyValue}>
        {measured ? '' : '~'}
        {energy.kcal.toLocaleString()} kcal
      </Text>
      <Text style={s.energyNote}>
        {measured ? `Measured by ${energy.source} for this session.` : `${energy.basis}. ${energy.caveat}`}
      </Text>
    </Card>
  );
}

function Big({ value, label }: { value: string; label: string }) {
  return (
    <View style={s.big}>
      <Text style={s.bigV}>{value}</Text>
      <Text style={s.bigL}>{label}</Text>
    </View>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    when: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.sm, fontFamily: fonts.body },
    map: {
      height: 300,
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.md,
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm },
    big: {
      width: '48.5%',
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
    },
    bigV: { color: colors.text, fontSize: 24, fontFamily: fonts.bodyBold },
    bigL: { color: colors.textMuted, fontSize: 12, marginTop: 2, fontFamily: fonts.body },
    splitRow: {
      flexDirection: 'row',
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    splitN: { width: 60, color: colors.textMuted, fontFamily: fonts.body },
    splitV: { flex: 1, color: colors.text, fontFamily: fonts.bodySemi },
    splitT: { color: colors.textMuted, fontFamily: fonts.body },
    delete: {
      marginTop: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingVertical: 13,
      alignItems: 'center',
    },
    deleteT: { color: colors.danger, fontFamily: fonts.bodySemi },
    energyValue: { color: colors.text, fontSize: 26, fontFamily: fonts.bodyBold, marginTop: 4 },
    energyNote: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 6, fontFamily: fonts.body },
  })
);
