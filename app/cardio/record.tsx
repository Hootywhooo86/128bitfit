import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteMap } from '@/components/RouteMap';
import { SportPicker } from '@/components/SportPicker';
import {
  discardCardioSessions,
  elapsedMs,
  finishCardioSession,
  getCardioFixes,
  getOpenCardioSession,
  pauseCardioSession,
  resumeCardioSession,
  startCardioSession,
} from '@/db/cardio-queries';
import { getCardioSettings, setLastSport } from '@/db/map-settings';
import { getSetting, setSetting } from '@/db/settings-queries';
import type { CardioSession } from '@/db/schema';
import {
  GOOD_FIX_M,
  cardioStats,
  formatDistance,
  formatDuration,
  formatPace,
  formatSpeed,
  paceFromSpeed,
  sportById,
  type DistanceUnit,
  type Fix,
  type Sport,
} from '@/lib/cardio';
import { mirrorWorkout } from '@/lib/health/mirror';
import { clearLiveCardioStats } from '@/lib/cardio-live-notification';
import { ensureLocationAccess, startTracking, stopTracking, type LocationAccess } from '@/lib/cardio-tracker';
import { MAP_ROUTE_BLUE, type MapStyleId } from '@/lib/map-style';
import { colors, fonts, spacing, themedStyles } from '@/lib/theme';
import { useSessionAwake } from '@/lib/use-session-awake';

type Here = { lat: number; lon: number; accuracy: number | null };

const BATTERY_TIP_KEY = 'cardio_battery_tip_shown';

/**
 * Record an outdoor session: full-screen map, the blue dot and the blue line
 * behind it, and the numbers over the top.
 *
 * The fixes are recorded by the background task (lib/cardio-tracker.ts) into
 * SQLite; this screen only reads them back. Leaving it, locking the phone or
 * the app being killed does not stop a recording — coming back picks it up.
 */
const NO_FIXES: Fix[] = [];

/** A crash here shows a screen with Try again, instead of closing the app. */
export { ErrorScreen as ErrorBoundary } from '@/components/ErrorScreen';

export default function RecordCardioScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ sport?: string }>();

  const [sport, setSport] = useState<Sport>(sportById(params.sport));
  const [picking, setPicking] = useState(false);
  const [styleId, setStyleId] = useState<MapStyleId>('dark');
  const [colours, setColours] = useState({ dot: MAP_ROUTE_BLUE, line: MAP_ROUTE_BLUE });
  const [autoPause, setAutoPauseOn] = useState(true);
  const [keepAwake, setKeepAwake] = useState(false);
  const [unit, setUnit] = useState<DistanceUnit>('km');
  const [access, setAccess] = useState<LocationAccess | 'checking'>('checking');
  const [here, setHere] = useState<Here | null>(null);
  const [session, setSession] = useState<CardioSession | null>(null);
  // Fixes belong to one session; held with its id so a different session
  // starts empty without an effect resetting them after the fact.
  const [track, setTrack] = useState<{ sessionId: string | null; fixes: Fix[] }>({ sessionId: null, fixes: [] });
  const fixes = track.sessionId != null && track.sessionId === session?.id ? track.fixes : NO_FIXES;
  const lastId = useRef(0);
  const lastFor = useRef<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);
  const [recenter, setRecenter] = useState(0);
  const [busy, setBusy] = useState(false);
  const [bottomH, setBottomH] = useState(0);

  // Settings, and any session an earlier visit (or an app kill) left open.
  useEffect(() => {
    void (async () => {
      const [cs, open] = await Promise.all([getCardioSettings(), getOpenCardioSession()]);
      setStyleId(cs.mapStyle);
      setColours({ dot: cs.dotColour, line: cs.lineColour });
      setAutoPauseOn(cs.autoPause);
      setKeepAwake(cs.keepAwake);
      setUnit(cs.distanceUnit);
      if (open) {
        setSession(open);
        setSport(sportById(open.sport));
      } else if (!params.sport) {
        setSport(sportById(cs.lastSport));
      }
    })();
  }, [params.sport]);

  // Location: ask once, then watch for the dot and the GPS banner.
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let alive = true;
    void (async () => {
      const a = await ensureLocationAccess();
      if (!alive) return;
      setAccess(a);
      if (a !== 'granted') return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (l) =>
          setHere({ lat: l.coords.latitude, lon: l.coords.longitude, accuracy: l.coords.accuracy ?? null })
      );
      if (!alive) sub.remove();
    })();
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);

  // A session left open by an app kill has lost its tracker: start it again.
  useEffect(() => {
    if (session && session.status !== 'finished' && access === 'granted') {
      void startTracking(sportById(session.sport).label, session.startedAt).catch((e) =>
        // Said out loud: a tracker that did not restart looks exactly like one
        // that did, until the route comes back with a hole in it.
        Alert.alert(
          'GPS did not restart',
          `This session is still open, but the route is not being recorded. Pause and resume to try again. (${
            e instanceof Error ? e.message : String(e)
          })`
        )
      );
    }
  }, [session?.id, access]); // eslint-disable-line react-hooks/exhaustive-deps

  // Read new fixes from SQLite while the screen is up.
  const pull = useCallback(async () => {
    if (!session) return;
    const id = session.id;
    if (lastFor.current !== id) {
      lastFor.current = id;
      lastId.current = 0;
    }
    const fresh = await getCardioFixes(id, lastId.current);
    if (fresh.length > 0) {
      lastId.current = fresh[fresh.length - 1].id;
      setTrack((prev) =>
        prev.sessionId === id ? { sessionId: id, fixes: [...prev.fixes, ...fresh] } : { sessionId: id, fixes: fresh }
      );
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    void pull();
    const t = setInterval(() => {
      if (AppState.currentState === 'active') void pull();
    }, 1500);
    return () => clearInterval(t);
  }, [session, pull]);

  // The clock on screen. Only a display: every figure comes from timestamps.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useSessionAwake(keepAwake && session?.status === 'recording');

  const stats = useMemo(() => cardioStats(fixes, sport, { autoPause, unit }), [fixes, sport, autoPause, unit]);
  const fixGood = here?.accuracy != null && here.accuracy <= GOOD_FIX_M;
  const recording = session?.status === 'recording';
  const paused = session?.status === 'paused';

  const start = async () => {
    if (!sport.gps) {
      router.replace({ pathname: '/cardio/manual', params: { sport: sport.id } });
      return;
    }
    if (access !== 'granted') return;

    // Once, before the first recording: some phones stop background apps to
    // save battery, which is the one thing that can break a pocketed or
    // backpacked recording. The app cannot see that setting, so it explains
    // and offers the page where it lives; it never blocks the start.
    if (!(await getSetting(BATTERY_TIP_KEY))) {
      await setSetting(BATTERY_TIP_KEY, '1');
      const openIt = await new Promise<boolean>((resolve) =>
        Alert.alert(
          'Keep recording with the screen off',
          'Recording carries on with the phone locked — in a pocket or a backpack. Some phones stop apps in the background to save battery, though. To be sure, open App info → Battery and choose "Unrestricted" for 128BIT FIT.',
          [
            { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Open App info', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) }
        )
      );
      if (openIt) {
        void Linking.openSettings();
        return;
      }
    }

    const go = async () => {
      setBusy(true);
      try {
        const id = await startCardioSession(sport.id);
        await setLastSport(sport.id);
        await startTracking(sport.label);
        setSession({
          id,
          sport: sport.id,
          status: 'recording',
          startedAt: Date.now(),
          endedAt: null,
          pausedAt: null,
          pausedMs: 0,
          segment: 0,
          distanceM: null,
          movingS: null,
          elapsedS: null,
          elevGainM: null,
          manual: false,
          notes: null,
        });
      } catch (e) {
        Alert.alert('Could not start recording', e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    };
    if (!fixGood) {
      Alert.alert(
        'GPS is still weak',
        here?.accuracy != null
          ? `Your position is only good to about ${Math.round(here.accuracy)} m. The first stretch may be rough.`
          : 'No position yet. The start of your route may be missing until the phone finds one.',
        [
          { text: 'Wait', style: 'cancel' },
          { text: 'Start anyway', onPress: () => void go() },
        ]
      );
      return;
    }
    await go();
  };

  const togglePause = async () => {
    if (!session || busy) return;
    setBusy(true);
    try {
      if (recording) await pauseCardioSession(session.id);
      else {
        await resumeCardioSession(session.id);
        // A no-op while GPS is running; restarts it if Android stopped it.
        await startTracking(sportById(session.sport).label, session.startedAt);
      }
      const open = await getOpenCardioSession();
      if (open) setSession(open);
    } catch (e) {
      Alert.alert('Could not resume', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    if (!session) return;
    Alert.alert('Finish this session?', undefined, [
      { text: 'Keep going', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Throw it away?', 'The route and time are deleted.', [
            { text: 'Keep it', style: 'cancel' },
            {
              text: 'Discard',
              style: 'destructive',
              onPress: async () => {
                await stopTracking();
                await discardCardioSessions([session.id]);
                // Again after the session is gone: a stats update already in
                // flight when tracking stopped could have put it back.
                await clearLiveCardioStats();
                router.back();
              },
            },
          ]),
      },
      {
        text: 'Finish',
        onPress: async () => {
          setBusy(true);
          try {
            await stopTracking();
            const done = await finishCardioSession(session.id, { autoPause, unit });
            await clearLiveCardioStats();
            if (done?.endedAt) {
              // Duration and sport only, like strength sessions: nothing estimated.
              mirrorWorkout({
                id: done.id,
                startedAt: done.startedAt,
                endedAt: done.endedAt,
                title: sport.label,
                exerciseType: sport.healthType,
              });
            }
            router.replace({ pathname: '/cardio/[id]', params: { id: session.id, fresh: '1' } });
          } catch (e) {
            Alert.alert('Could not save it', e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  const timeS = session ? elapsedMs(session, now) / 1000 : 0;
  const unitLabel = unit === 'mi' ? 'mi' : 'km';
  const speedLabel = unit === 'mi' ? 'mph' : 'km/h';
  const avgValue = sport.showSpeed ? formatSpeed(stats.avgSpeed, unit) : formatPace(stats.avgPace);
  const avgLabel = sport.showSpeed ? `Avg speed (${speedLabel})` : `Avg pace (/${unitLabel})`;
  // Only while actually recording, and only from a recent fix: a figure from
  // before a pause, or from a phone that stopped reporting, is not "current".
  const lastFixT = fixes.length ? fixes[fixes.length - 1].t : 0;
  const curSpeed = recording && now - lastFixT < 15_000 ? stats.currentSpeed : null;
  const curValue = sport.showSpeed
    ? formatSpeed(curSpeed, unit)
    : curSpeed === 0
      ? 'Stopped'
      : formatPace(paceFromSpeed(curSpeed, unit));
  const curLabel = sport.showSpeed ? `Speed (${speedLabel})` : `Pace (/${unitLabel})`;
  const distValue = session ? formatDistance(stats.distanceM, unit) : '–';

  if (access === 'denied' || access === 'off') {
    return (
      <View style={[s.screen, { paddingTop: insets.top + 12 }]}>
        <TopRow onBack={() => router.back()} />
        <View style={s.emptyWrap}>
          <Text style={s.emptyTitle}>
            {access === 'off' ? 'Location is switched off' : "Location is off — cardio can't record a route"}
          </Text>
          <Text style={s.emptyBody}>
            {access === 'off'
              ? 'Turn on Location in your phone’s quick settings, then come back.'
              : 'A route needs your position. It stays on this phone and is never sent anywhere.'}
          </Text>
          {access === 'denied' ? (
            <Pressable style={s.primary} onPress={() => void Linking.openSettings()}>
              <Text style={s.primaryT}>Open settings</Text>
            </Pressable>
          ) : null}
          <Pressable
            style={s.secondary}
            onPress={() => router.replace({ pathname: '/cardio/manual', params: { sport: 'treadmill' } })}
          >
            <Text style={s.secondaryT}>Log it by hand instead</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={s.screen}>
      <RouteMap
        fixes={fixes}
        here={here}
        styleId={styleId}
        follow
        bottomInset={bottomH}
        recenterKey={recenter}
        dotColour={colours.dot}
        lineColour={colours.line}
      />

      <View style={[s.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <TopRow onBack={() => router.back()} />
      </View>

      <View style={[s.side, { bottom: bottomH + 12 }]} pointerEvents="box-none">
        <RoundBtn label={styleId === 'dark' ? 'LIGHT' : 'DARK'} onPress={() => setStyleId(styleId === 'dark' ? 'light' : 'dark')} />
        <RoundBtn label="◎" big onPress={() => setRecenter((n) => n + 1)} accessibilityLabel="Centre on me" />
      </View>

      <View
        style={[s.bottom, { paddingBottom: insets.bottom + 12 }]}
        onLayout={(e) => setBottomH(e.nativeEvent.layout.height)}
      >
        <View style={s.card}>
          <View style={[s.banner, session ? s.bannerQuiet : fixGood ? s.bannerGood : null]}>
            <View style={{ width: 22 }} />
            <Text style={[s.bannerT, !session && fixGood && s.bannerTGood]}>
              {session
                ? paused
                  ? 'PAUSED'
                  : sport.label.toUpperCase()
                : access === 'checking'
                  ? 'CHECKING LOCATION…'
                  : fixGood
                    ? 'GPS ACQUIRED'
                    : here?.accuracy != null
                      ? `ACQUIRING GPS… ±${Math.round(here.accuracy)} M`
                      : 'ACQUIRING GPS…'}
            </Text>
            <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={10} accessibilityLabel="More numbers">
              <Text style={s.expand}>{expanded ? '⤡' : '⤢'}</Text>
            </Pressable>
          </View>

          <View style={s.stats}>
            <Stat value={formatDuration(timeS)} label="Time" />
            <Stat value={session ? curValue : '–'} label={curLabel} />
            <Stat value={distValue} label={`Distance (${unitLabel})`} />
          </View>
          {expanded ? (
            <View style={[s.stats, s.statsMore]}>
              <Stat value={session ? avgValue : '–'} label={avgLabel} />
              <Stat value={session ? formatDuration(stats.movingS) : '–'} label="Moving time" />
              <Stat
                value={stats.elevGainM != null ? String(Math.round(unit === 'mi' ? stats.elevGainM * 3.28084 : stats.elevGainM)) : '–'}
                label={`Climb (${unit === 'mi' ? 'ft' : 'm'})`}
              />
            </View>
          ) : null}
        </View>

        {!session ? (
          <View style={s.controls}>
            <Pressable style={s.sportBtn} onPress={() => setPicking(true)} accessibilityLabel="Choose sport">
              <View style={s.sportBadge}>
                <Text style={s.sportBadgeT}>{sport.badge}</Text>
              </View>
              <Text style={s.sportName} numberOfLines={1}>
                {sport.label}
              </Text>
            </Pressable>
            <Pressable
              style={[s.startBtn, (busy || access !== 'granted') && { opacity: 0.5 }]}
              onPress={() => void start()}
              disabled={busy || access !== 'granted'}
              accessibilityLabel="Start"
            >
              <Text style={s.startT}>▶</Text>
            </Pressable>
            <View style={s.sportBtn} />
          </View>
        ) : paused ? (
          <View style={s.row2}>
            <Pressable style={[s.wide, s.resume]} onPress={() => void togglePause()} disabled={busy}>
              <Text style={s.wideT}>▶  Resume</Text>
            </Pressable>
            <Pressable style={[s.wide, s.finishBtn]} onPress={finish} disabled={busy}>
              <Text style={s.finishT}>■  Finish</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable style={[s.wide, s.resume]} onPress={() => void togglePause()} disabled={busy}>
            <Text style={s.wideT}>❚❚  Pause</Text>
          </Pressable>
        )}
      </View>

      <SportPicker
        visible={picking}
        selected={sport.id}
        onClose={() => setPicking(false)}
        onPick={(sp) => {
          setPicking(false);
          setSport(sp);
          if (!sp.gps) router.replace({ pathname: '/cardio/manual', params: { sport: sp.id } });
        }}
      />
    </View>
  );
}

function TopRow({ onBack }: { onBack: () => void }) {
  return (
    <View style={s.topRow}>
      <Pressable style={s.round} onPress={onBack} accessibilityLabel="Back" hitSlop={6}>
        <Text style={s.roundT}>‹</Text>
      </Pressable>
    </View>
  );
}

function RoundBtn({
  label,
  onPress,
  big,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  big?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable style={s.round} onPress={onPress} accessibilityLabel={accessibilityLabel ?? label} hitSlop={6}>
      <Text style={big ? s.roundT : s.roundSmall}>{label}</Text>
    </Pressable>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statV} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={s.statL} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const s = themedStyles(() =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: spacing.md },
    topRow: { flexDirection: 'row', alignItems: 'center' },
    side: { position: 'absolute', right: spacing.md, gap: 10, alignItems: 'center' },
    round: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: 'rgba(0,0,0,0.85)',
      borderWidth: 1,
      borderColor: colors.borderBright,
      alignItems: 'center',
      justifyContent: 'center',
    },
    roundT: { color: colors.text, fontSize: 24, lineHeight: 28 },
    roundSmall: { color: colors.text, fontFamily: fonts.pixel, fontSize: 6 },
    bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.md, gap: 12 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.surfaceAlt,
    },
    bannerGood: { backgroundColor: colors.accent },
    bannerQuiet: { backgroundColor: colors.surface },
    bannerT: { flex: 1, textAlign: 'center', fontFamily: fonts.pixel, fontSize: 7, color: colors.textMuted, letterSpacing: 0.7 },
    bannerTGood: { color: colors.onAccent },
    expand: { width: 22, textAlign: 'right', color: colors.text, fontSize: 18 },
    stats: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 8 },
    statsMore: { borderTopWidth: 1, borderTopColor: colors.border },
    stat: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
    statV: { color: colors.text, fontSize: 30, fontFamily: fonts.bodyBold },
    statL: { color: colors.textMuted, fontSize: 12, marginTop: 2, fontFamily: fonts.body },
    controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sportBtn: { width: 96, alignItems: 'center', gap: 6 },
    sportBadge: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.borderBright,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sportBadgeT: { fontFamily: fonts.pixel, fontSize: 8, color: colors.text },
    sportName: { color: colors.text, fontSize: 13, fontFamily: fonts.body },
    startBtn: {
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    startT: { color: colors.onAccent, fontSize: 32, marginLeft: 4 },
    row2: { flexDirection: 'row', gap: 10 },
    wide: { flex: 1, borderRadius: 30, paddingVertical: 18, alignItems: 'center' },
    resume: { backgroundColor: colors.accent },
    wideT: { color: colors.onAccent, fontSize: 18, fontFamily: fonts.bodyBold },
    finishBtn: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.borderBright },
    finishT: { color: colors.text, fontSize: 18, fontFamily: fonts.bodyBold },
    emptyWrap: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: 14 },
    emptyTitle: { color: colors.text, fontSize: 18, fontFamily: fonts.bodyBold, textAlign: 'center' },
    emptyBody: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: fonts.body },
    primary: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
    primaryT: { color: colors.onAccent, fontFamily: fonts.bodyBold, fontSize: 15 },
    secondary: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
    secondaryT: { color: colors.text, fontFamily: fonts.bodySemi, fontSize: 15 },
  })
);
